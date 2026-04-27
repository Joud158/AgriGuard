const { randomUUID } = require('crypto');
const { readDb, updateDb } = require('../data/store');
const httpError = require('../utils/httpError');
const { createNotificationRecord } = require('./notificationService');
const {
  isConfigured: isRealtimeConfigured,
  getConversationChannelName,
  getUserChannelName,
  triggerConversationMessage,
  authorizeConversationChannel,
  triggerUserConversationRefresh,
  authorizeUserChannel,
} = require('./pusherService');
const { logWarn } = require('../utils/logger');

function ensureCollections(db) {
  if (!Array.isArray(db.users)) db.users = [];
  if (!Array.isArray(db.teams)) db.teams = [];
  if (!Array.isArray(db.players)) db.players = [];
  if (!Array.isArray(db.team_memberships)) db.team_memberships = [];
  if (!Array.isArray(db.notifications)) db.notifications = [];
  if (!Array.isArray(db.conversations)) db.conversations = [];
  if (!Array.isArray(db.conversation_participants)) db.conversation_participants = [];
  if (!Array.isArray(db.messages)) db.messages = [];
}

function capitalize(value) {
  if (!value) return '';
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function getRoleLabel(role) {
  if (role === 'admin') return 'Administrator';
  if (role === 'coach') return 'Agronomist';
  if (role === 'player') return 'Farmer';
  return capitalize(role) || 'User';
}

function sanitizeUserSummary(user) {
  if (!user) return null;

  return {
    id: user.id,
    full_name: user.full_name,
    email: user.email,
    role: user.role,
    is_active: user.is_active,
  };
}

function sanitizeTeamSummary(team) {
  if (!team) return null;

  return {
    id: team.id,
    name: team.name,
    coach_user_id: team.coach_user_id,
  };
}

function findUserInClub(db, userId, clubId) {
  return db.users.find((entry) => entry.id === userId && entry.club_id === clubId);
}

function findTeamInClub(db, teamId, clubId) {
  return db.teams.find((entry) => entry.id === teamId && entry.club_id === clubId);
}

function findPlayerByUserId(db, userId, clubId) {
  return db.players.find((entry) => entry.user_id === userId && entry.club_id === clubId);
}

function buildClubTeamIdSet(db, clubId) {
  return new Set(db.teams.filter((entry) => entry.club_id === clubId).map((entry) => entry.id));
}

function listMembershipsByPlayerIdInClub(db, playerId, clubId) {
  const clubTeamIds = buildClubTeamIdSet(db, clubId);
  return db.team_memberships.filter(
    (entry) => entry.player_id === playerId && clubTeamIds.has(entry.team_id)
  );
}

function listCoachedTeams(db, clubId, coachUserId) {
  return db.teams
    .filter((entry) => entry.club_id === clubId && entry.coach_user_id === coachUserId)
    .sort((left, right) => left.name.localeCompare(right.name));
}

function listPlayerTeams(db, clubId, playerUserId) {
  const player = findPlayerByUserId(db, playerUserId, clubId);
  if (!player) {
    return [];
  }

  return listMembershipsByPlayerIdInClub(db, player.id, clubId)
    .map((membership) => findTeamInClub(db, membership.team_id, clubId))
    .filter(Boolean)
    .sort((left, right) => left.name.localeCompare(right.name));
}

function listActorTeams(db, actor) {
  if (actor.role === 'coach') {
    return listCoachedTeams(db, actor.clubId, actor.id);
  }

  if (actor.role === 'player') {
    return listPlayerTeams(db, actor.clubId, actor.id);
  }

  return [];
}

function listSharedTeamsForUsers(db, clubId, firstUserId, secondUserId) {
  const firstTeamIds = new Set(listActorTeams(db, { clubId, role: 'coach', id: firstUserId }).map((team) => team.id));
  const firstPlayerTeams = listActorTeams(db, { clubId, role: 'player', id: firstUserId });
  firstPlayerTeams.forEach((team) => firstTeamIds.add(team.id));

  const secondTeamIds = new Set(listActorTeams(db, { clubId, role: 'coach', id: secondUserId }).map((team) => team.id));
  const secondPlayerTeams = listActorTeams(db, { clubId, role: 'player', id: secondUserId });
  secondPlayerTeams.forEach((team) => secondTeamIds.add(team.id));

  return db.teams
    .filter((team) => team.club_id === clubId && firstTeamIds.has(team.id) && secondTeamIds.has(team.id))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function listTeamParticipantUsers(db, clubId, teamId) {
  const team = findTeamInClub(db, teamId, clubId);
  if (!team) {
    return [];
  }

  const participants = [];
  const participantIds = new Set();

  if (team.coach_user_id) {
    const coach = findUserInClub(db, team.coach_user_id, clubId);
    if (coach && coach.is_active && coach.role === 'coach') {
      participants.push(coach);
      participantIds.add(coach.id);
    }
  }

  const memberships = db.team_memberships.filter((entry) => entry.team_id === teamId);
  memberships.forEach((membership) => {
    const player = db.players.find((entry) => entry.id === membership.player_id && entry.club_id === clubId);
    if (!player) {
      return;
    }

    const user = findUserInClub(db, player.user_id, clubId);
    if (!user || !user.is_active || user.role !== 'player' || participantIds.has(user.id)) {
      return;
    }

    participants.push(user);
    participantIds.add(user.id);
  });

  return participants.sort((left, right) => left.full_name.localeCompare(right.full_name));
}

function getDirectConversationParticipantUsers(db, conversation) {
  const seenIds = new Set();

  return db.conversation_participants
    .filter((entry) => entry.conversation_id === conversation.id)
    .map((participant) => findUserInClub(db, participant.user_id, conversation.club_id))
    .filter((user) => {
      if (!user || seenIds.has(user.id)) {
        return false;
      }

      seenIds.add(user.id);
      return true;
    })
    .sort((left, right) => left.full_name.localeCompare(right.full_name));
}

function canUsersDirectMessage(db, clubId, firstUser, secondUser) {
  if (!firstUser || !secondUser) {
    return false;
  }

  if (firstUser.id === secondUser.id) {
    return false;
  }

  if (firstUser.club_id !== clubId || secondUser.club_id !== clubId) {
    return false;
  }

  if (!firstUser.is_active || !secondUser.is_active) {
    return false;
  }

  if (firstUser.role === 'admin' || secondUser.role === 'admin') {
    return true;
  }

  const sharedTeams = listSharedTeamsForUsers(db, clubId, firstUser.id, secondUser.id);
  if (!sharedTeams.length) {
    return false;
  }

  return true;
}

function getConversationParticipants(db, conversation) {
  if (conversation.type === 'team') {
    return listTeamParticipantUsers(db, conversation.club_id, conversation.team_id);
  }

  return getDirectConversationParticipantUsers(db, conversation);
}

function canActorAccessConversation(db, actor, conversation) {
  if (!conversation || conversation.club_id !== actor.clubId) {
    return false;
  }

  if (conversation.type === 'team') {
    return listTeamParticipantUsers(db, actor.clubId, conversation.team_id).some((user) => user.id === actor.id);
  }

  const participants = getDirectConversationParticipantUsers(db, conversation);
  if (participants.length !== 2 || !participants.some((user) => user.id === actor.id)) {
    return false;
  }

  return canUsersDirectMessage(db, actor.clubId, participants[0], participants[1]);
}

function getAccessibleConversationOrThrow(db, actor, conversationId) {
  const conversation = db.conversations.find(
    (entry) => entry.id === conversationId && entry.club_id === actor.clubId
  );

  if (!conversation || !canActorAccessConversation(db, actor, conversation)) {
    throw httpError(404, 'Conversation not found.');
  }

  return conversation;
}

function getLastMessageForConversation(db, conversationId) {
  return db.messages
    .filter((entry) => entry.conversation_id === conversationId)
    .sort((left, right) => new Date(right.created_at) - new Date(left.created_at))[0] || null;
}

function getUnreadConversationNotificationCount(db, actor, conversationId) {
  return db.notifications.filter((entry) => {
    return (
      entry.user_id === actor.id &&
      entry.club_id === actor.clubId &&
      entry.related_entity_type === 'conversation' &&
      entry.related_entity_id === conversationId &&
      !entry.is_read
    );
  }).length;
}

function markConversationNotificationsRead(db, actor, conversationId) {
  const now = new Date().toISOString();

  db.notifications.forEach((entry) => {
    const matchesConversation =
      entry.user_id === actor.id &&
      entry.club_id === actor.clubId &&
      entry.related_entity_type === 'conversation' &&
      entry.related_entity_id === conversationId;

    if (matchesConversation && !entry.is_read) {
      entry.is_read = true;
      entry.read_at = now;
    }
  });
}

function buildConversationTitle(db, actor, conversation, participants) {
  if (conversation.type === 'team') {
    const team = findTeamInClub(db, conversation.team_id, conversation.club_id);
    return {
      title: team ? `${team.name} Team Chat` : 'Team Chat',
      subtitle: team ? `${participants.length} participant${participants.length === 1 ? '' : 's'}` : '',
    };
  }

  const otherParticipant =
    participants.find((participant) => participant.id !== actor.id) || participants[0] || null;

  return {
    title: otherParticipant?.full_name || 'Direct Message',
    subtitle: otherParticipant ? getRoleLabel(otherParticipant.role) : '',
    otherParticipant,
  };
}

function serializeMessage(db, message) {
  const conversation = db.conversations.find((entry) => entry.id === message.conversation_id);
  const sender = conversation
    ? findUserInClub(db, message.sender_user_id, conversation.club_id)
    : null;

  return {
    id: message.id,
    conversation_id: message.conversation_id,
    sender_user_id: message.sender_user_id,
    content: message.content,
    created_at: message.created_at,
    sender: sanitizeUserSummary(sender),
  };
}

function serializeConversationSummary(db, actor, conversation) {
  const participants = getConversationParticipants(db, conversation);
  const team = conversation.team_id ? findTeamInClub(db, conversation.team_id, conversation.club_id) : null;
  const { title, subtitle, otherParticipant } = buildConversationTitle(db, actor, conversation, participants);
  const lastMessage = getLastMessageForConversation(db, conversation.id);
  const unreadCount = getUnreadConversationNotificationCount(db, actor, conversation.id);

  return {
    id: conversation.id,
    type: conversation.type,
    team_id: conversation.team_id,
    created_at: conversation.created_at,
    updated_at: conversation.updated_at,
    realtime_enabled: isRealtimeConfigured(),
    title,
    subtitle,
    channel_name: getConversationChannelName(conversation.id),
    team: sanitizeTeamSummary(team),
    other_participant: sanitizeUserSummary(otherParticipant),
    participants: participants.map(sanitizeUserSummary),
    last_message: lastMessage ? serializeMessage(db, lastMessage) : null,
    unread_count: unreadCount,
    has_unread: unreadCount > 0,
  };
}

function findDirectConversation(db, clubId, firstUserId, secondUserId) {
  return db.conversations.find((conversation) => {
    if (conversation.club_id !== clubId || conversation.type !== 'direct') {
      return false;
    }

    const participantIds = db.conversation_participants
      .filter((entry) => entry.conversation_id === conversation.id)
      .map((entry) => entry.user_id);

    return (
      participantIds.length === 2 &&
      participantIds.includes(firstUserId) &&
      participantIds.includes(secondUserId)
    );
  });
}

function findTeamConversation(db, clubId, teamId) {
  return db.conversations.find(
    (conversation) =>
      conversation.club_id === clubId && conversation.type === 'team' && conversation.team_id === teamId
  );
}

function buildMessageNotificationText(db, conversation, sender, content) {
  const trimmed = String(content || '').trim();
  const preview = trimmed.length > 80 ? `${trimmed.slice(0, 80).trimEnd()}...` : trimmed;

  if (conversation.type === 'team') {
    const team = findTeamInClub(db, conversation.team_id, conversation.club_id);
    const teamLabel = team?.name || 'team chat';
    return `${sender.full_name} posted in ${teamLabel}: ${preview}`;
  }

  return `New message from ${sender.full_name}: ${preview}`;
}

function appendMessageNotifications(db, actor, conversation, sender, content) {
  const participantUsers = getConversationParticipants(db, conversation);
  const notifications = participantUsers
    .filter((user) => user.id !== actor.id && user.is_active)
    .map((user) =>
      createNotificationRecord({
        clubId: actor.clubId,
        userId: user.id,
        teamId: conversation.team_id || '',
        type: 'message_received',
        message: buildMessageNotificationText(db, conversation, sender, content),
        relatedEntityType: 'conversation',
        relatedEntityId: conversation.id,
      })
    );

  if (notifications.length > 0) {
    db.notifications.unshift(...notifications);
  }
}

async function listConversations(actor) {
  const db = await readDb();
  ensureCollections(db);

  const conversations = db.conversations
    .filter((conversation) => canActorAccessConversation(db, actor, conversation))
    .sort((left, right) => new Date(right.updated_at) - new Date(left.updated_at))
    .map((conversation) => serializeConversationSummary(db, actor, conversation));

  const actorTeams = listActorTeams(db, actor);
  const teamChats = actorTeams.map((team) => {
    const conversation = findTeamConversation(db, actor.clubId, team.id);

    return {
      team: sanitizeTeamSummary(team),
      title: `${team.name} Team Chat`,
      conversation_id: conversation?.id || '',
    };
  });

  const directTargets = [];
  if (actor.role === 'admin') {
    directTargets.push(
      ...db.users
        .filter((user) => user.club_id === actor.clubId && user.is_active && user.id !== actor.id)
        .sort((left, right) => left.full_name.localeCompare(right.full_name))
        .map((user) => {
          const conversation = findDirectConversation(db, actor.clubId, actor.id, user.id);

          return {
            user: sanitizeUserSummary(user),
            shared_team_names: [],
            conversation_id: conversation?.id || '',
          };
        })
    );
  } else if (actor.role === 'player' || actor.role === 'coach') {
    const targetsByUserId = new Map();

    actorTeams.forEach((team) => {
      listTeamParticipantUsers(db, actor.clubId, team.id).forEach((participant) => {
        if (participant.id === actor.id || !participant.is_active) {
          return;
        }

        const existing = targetsByUserId.get(participant.id);
        if (existing) {
          if (!existing.shared_team_names.includes(team.name)) {
            existing.shared_team_names.push(team.name);
          }
          return;
        }

        const conversation = findDirectConversation(db, actor.clubId, actor.id, participant.id);
        targetsByUserId.set(participant.id, {
          user: sanitizeUserSummary(participant),
          shared_team_names: [team.name],
          conversation_id: conversation?.id || '',
        });
      });
    });

    directTargets.push(
      ...Array.from(targetsByUserId.values()).sort((left, right) =>
        (left.user?.full_name || '').localeCompare(right.user?.full_name || '')
      )
    );
  }

  return {
    conversations,
    available_team_chats: teamChats,
    available_direct_targets: directTargets,
    realtime_enabled: isRealtimeConfigured(),
  };
}

async function getConversationMessages(actor, conversationId) {
  return updateDb(async (db) => {
    ensureCollections(db);

    const conversation = getAccessibleConversationOrThrow(db, actor, conversationId);
    markConversationNotificationsRead(db, actor, conversation.id);

    const messages = db.messages
      .filter((entry) => entry.conversation_id === conversation.id)
      .sort((left, right) => new Date(left.created_at) - new Date(right.created_at))
      .map((message) => serializeMessage(db, message));

    return {
      conversation: serializeConversationSummary(db, actor, conversation),
      messages,
    };
  });
}

async function createDirectConversation(actor, payload) {
  const result = await updateDb(async (db) => {
    ensureCollections(db);

    const actorUser = findUserInClub(db, actor.id, actor.clubId);
    const targetUser = findUserInClub(db, payload.targetUserId, actor.clubId);

    if (!actorUser || !actorUser.is_active) {
      throw httpError(403, 'Your account can no longer start conversations.');
    }

    if (!targetUser) {
      throw httpError(404, 'Target user not found.');
    }

    if (payload.targetUserId === actor.id) {
      throw httpError(400, 'You cannot start a conversation with yourself.');
    }

    if (!canUsersDirectMessage(db, actor.clubId, actorUser, targetUser)) {
      throw httpError(
        403,
        actor.role === 'admin'
          ? 'Admins can only start direct messages with active users in their own club.'
          : 'Direct messages are only allowed between team members who currently share a team.'
      );
    }

    const existingConversation = findDirectConversation(db, actor.clubId, actor.id, targetUser.id);
    if (existingConversation) {
      return {
        created: false,
        conversation: serializeConversationSummary(db, actor, existingConversation),
      };
    }

    const now = new Date().toISOString();
    const conversation = {
      id: `conversation-${randomUUID()}`,
      club_id: actor.clubId,
      type: 'direct',
      team_id: null,
      created_at: now,
      updated_at: now,
    };

    db.conversations.unshift(conversation);
    db.conversation_participants.unshift(
      {
        id: `conversation-participant-${randomUUID()}`,
        conversation_id: conversation.id,
        user_id: actor.id,
        created_at: now,
      },
      {
        id: `conversation-participant-${randomUUID()}`,
        conversation_id: conversation.id,
        user_id: targetUser.id,
        created_at: now,
      }
    );

    return {
      created: true,
      conversation: serializeConversationSummary(db, actor, conversation),
    };
  });

  return result;
}

async function createTeamConversation(actor, payload) {
  const result = await updateDb(async (db) => {
    ensureCollections(db);

    const team = findTeamInClub(db, payload.teamId, actor.clubId);
    if (!team) {
      throw httpError(404, 'Team not found.');
    }

    const participants = listTeamParticipantUsers(db, actor.clubId, team.id);
    if (!participants.some((user) => user.id === actor.id)) {
      throw httpError(403, 'You do not have access to this team chat.');
    }

    const existingConversation = findTeamConversation(db, actor.clubId, team.id);
    if (existingConversation) {
      return {
        created: false,
        conversation: serializeConversationSummary(db, actor, existingConversation),
      };
    }

    const now = new Date().toISOString();
    const conversation = {
      id: `conversation-${randomUUID()}`,
      club_id: actor.clubId,
      type: 'team',
      team_id: team.id,
      created_at: now,
      updated_at: now,
    };

    db.conversations.unshift(conversation);
    db.conversation_participants.unshift(
      ...participants.map((user) => ({
        id: `conversation-participant-${randomUUID()}`,
        conversation_id: conversation.id,
        user_id: user.id,
        created_at: now,
      }))
    );

    return {
      created: true,
      conversation: serializeConversationSummary(db, actor, conversation),
    };
  });

  return result;
}

async function createMessage(actor, conversationId, payload) {
  const result = await updateDb(async (db) => {
    ensureCollections(db);

    const conversation = getAccessibleConversationOrThrow(db, actor, conversationId);
    const sender = findUserInClub(db, actor.id, actor.clubId);

    if (!sender || !sender.is_active) {
      throw httpError(403, 'Your account can no longer send messages.');
    }

    const now = new Date().toISOString();
    const message = {
      id: `message-${randomUUID()}`,
      conversation_id: conversation.id,
      sender_user_id: actor.id,
      content: payload.content.trim(),
      created_at: now,
    };

    db.messages.push(message);
    conversation.updated_at = now;
    appendMessageNotifications(db, actor, conversation, sender, message.content);
    const participantUserIds = getConversationParticipants(db, conversation).map((user) => user.id);

    return {
      message: serializeMessage(db, message),
      conversationId: conversation.id,
      socketId: payload.socketId || '',
      participantUserIds,
    };
  });

  try {
    await triggerConversationMessage(result.conversationId, result.message, result.socketId);
  } catch (error) {
    logWarn('Failed to publish realtime message event.', {
      conversationId: result.conversationId,
      error: error.message,
    });
  }

  await Promise.all(
    result.participantUserIds.map(async (userId) => {
      try {
        await triggerUserConversationRefresh(
          userId,
          {
            conversation_id: result.conversationId,
            message_id: result.message.id,
          },
          result.socketId
        );
      } catch (error) {
        logWarn('Failed to publish conversation refresh event.', {
          conversationId: result.conversationId,
          userId,
          error: error.message,
        });
      }
    })
  );

  return result.message;
}

function extractConversationIdFromChannelName(channelName) {
  const match = /^private-conversation-(conversation-[A-Za-z0-9-]+)$/.exec(String(channelName || ''));
  return match ? match[1] : '';
}

function extractUserIdFromChannelName(channelName) {
  const match = /^private-user-([A-Za-z0-9-]+)$/.exec(String(channelName || ''));
  return match ? match[1] : '';
}

async function authorizeConversationSubscription(actor, payload) {
  const conversationId = extractConversationIdFromChannelName(payload.channel_name);
  if (conversationId) {
    const db = await readDb();
    ensureCollections(db);
    getAccessibleConversationOrThrow(db, actor, conversationId);

    return authorizeConversationChannel(payload.socket_id, payload.channel_name);
  }

  const userId = extractUserIdFromChannelName(payload.channel_name);
  if (userId) {
    if (userId !== actor.id) {
      throw httpError(403, 'You do not have access to this realtime channel.');
    }

    return authorizeUserChannel(payload.socket_id, payload.channel_name);
  }

  throw httpError(400, 'Invalid channel name.');
}

module.exports = {
  listConversations,
  getConversationMessages,
  createDirectConversation,
  createTeamConversation,
  createMessage,
  authorizeConversationSubscription,
};
