process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key';
process.env.EMAIL_ENABLED = 'false';

const request = require('supertest');
const app = require('../src/app');
const { readDb, resetDb } = require('../src/data/store');
const { createAccessToken } = require('../src/utils/tokens');

jest.setTimeout(15000);

beforeEach(async () => {
  await resetDb();
});

async function login(email, password) {
  const response = await request(app).post('/api/auth/login').send({ email, password });
  return response.body.data.token;
}

function tokenForUser(user) {
  return createAccessToken(user);
}

async function listUsers(token) {
  const response = await request(app).get('/api/auth/users').set('Authorization', `Bearer ${token}`);
  return response.body.data;
}

async function createTeam(adminToken, payload) {
  return request(app).post('/api/teams').set('Authorization', `Bearer ${adminToken}`).send(payload);
}

async function createPlayer(adminToken, payload) {
  return request(app).post('/api/players').set('Authorization', `Bearer ${adminToken}`).send(payload);
}

async function addPlayerToTeam(adminToken, teamId, playerId) {
  return request(app)
    .post(`/api/teams/${teamId}/players`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ playerId });
}

describe('AgriGuard messaging', () => {
  test('player can start a direct conversation with their team coach and send messages', async () => {
    const adminToken = await login('admin@agriguard.com', 'Admin@123!');
    const playerToken = await login('player@agriguard.com', 'Player@123!');
    const coachToken = await login('coach@agriguard.com', 'Coach@123!');
    const users = await listUsers(adminToken);
    const coachUser = users.find((user) => user.email === 'coach@agriguard.com');
    const playerUser = users.find((user) => user.email === 'player@agriguard.com');

    const teamResponse = await createTeam(adminToken, {
      name: 'Panthers',
      coachUserId: coachUser.id,
    });
    const teamId = teamResponse.body.data.id;

    const playerResponse = await createPlayer(adminToken, {
      userId: playerUser.id,
      jerseyNumber: 8,
      preferredPosition: 'Setter',
    });

    await addPlayerToTeam(adminToken, teamId, playerResponse.body.data.id);

    const listResponse = await request(app)
      .get('/api/conversations')
      .set('Authorization', `Bearer ${playerToken}`);

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.body.data.available_direct_targets).toHaveLength(1);
    expect(listResponse.body.data.available_direct_targets[0].user.id).toBe(coachUser.id);
    expect(listResponse.body.data.available_team_chats).toHaveLength(1);
    expect(listResponse.body.data.available_team_chats[0].team.id).toBe(teamId);

    const directConversationResponse = await request(app)
      .post('/api/conversations/direct')
      .set('Authorization', `Bearer ${playerToken}`)
      .send({ targetUserId: coachUser.id });

    expect(directConversationResponse.statusCode).toBe(201);
    expect(directConversationResponse.body.data.type).toBe('direct');

    const conversationId = directConversationResponse.body.data.id;
    const sendMessageResponse = await request(app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${playerToken}`)
      .send({ content: 'Hi coach, can we review tomorrow?' });

    expect(sendMessageResponse.statusCode).toBe(201);
    expect(sendMessageResponse.body.data.content).toBe('Hi coach, can we review tomorrow?');
    expect(sendMessageResponse.body.data.sender.role).toBe('player');

    const coachConversationsBeforeReadResponse = await request(app)
      .get('/api/conversations')
      .set('Authorization', `Bearer ${coachToken}`);

    expect(coachConversationsBeforeReadResponse.statusCode).toBe(200);
    const unreadConversation = coachConversationsBeforeReadResponse.body.data.conversations.find(
      (conversation) => conversation.id === conversationId
    );
    expect(unreadConversation).toBeTruthy();
    expect(unreadConversation.unread_count).toBe(1);
    expect(unreadConversation.has_unread).toBe(true);

    const coachMessagesResponse = await request(app)
      .get(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${coachToken}`);

    expect(coachMessagesResponse.statusCode).toBe(200);
    expect(coachMessagesResponse.body.data.conversation.id).toBe(conversationId);
    expect(coachMessagesResponse.body.data.conversation.unread_count).toBe(0);
    expect(coachMessagesResponse.body.data.conversation.has_unread).toBe(false);
    expect(coachMessagesResponse.body.data.messages).toHaveLength(1);
    expect(coachMessagesResponse.body.data.messages[0].content).toBe('Hi coach, can we review tomorrow?');

    const coachConversationsAfterReadResponse = await request(app)
      .get('/api/conversations')
      .set('Authorization', `Bearer ${coachToken}`);

    expect(coachConversationsAfterReadResponse.statusCode).toBe(200);
    const readConversation = coachConversationsAfterReadResponse.body.data.conversations.find(
      (conversation) => conversation.id === conversationId
    );
    expect(readConversation).toBeTruthy();
    expect(readConversation.unread_count).toBe(0);
    expect(readConversation.has_unread).toBe(false);

    const coachNotificationsResponse = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${coachToken}`);

    expect(coachNotificationsResponse.statusCode).toBe(200);
    expect(coachNotificationsResponse.body.data).toHaveLength(1);
    expect(coachNotificationsResponse.body.data[0].type).toBe('message_received');
    expect(coachNotificationsResponse.body.data[0].related_entity_id).toBe(conversationId);
    expect(coachNotificationsResponse.body.data[0].is_read).toBe(true);
  });

  test('admin can start a direct conversation with any active club member', async () => {
    const adminToken = await login('admin@agriguard.com', 'Admin@123!');
    const coachToken = await login('coach@agriguard.com', 'Coach@123!');
    const users = await listUsers(adminToken);
    const coachUser = users.find((user) => user.email === 'coach@agriguard.com');
    const playerUser = users.find((user) => user.email === 'player@agriguard.com');

    const listResponse = await request(app)
      .get('/api/conversations')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.body.data.available_direct_targets).toHaveLength(2);
    expect(
      listResponse.body.data.available_direct_targets.some((target) => target.user.id === coachUser.id)
    ).toBe(true);
    expect(
      listResponse.body.data.available_direct_targets.some((target) => target.user.id === playerUser.id)
    ).toBe(true);

    const directConversationResponse = await request(app)
      .post('/api/conversations/direct')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ targetUserId: coachUser.id });

    expect(directConversationResponse.statusCode).toBe(201);
    expect(directConversationResponse.body.data.type).toBe('direct');

    const conversationId = directConversationResponse.body.data.id;
    const sendMessageResponse = await request(app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ content: 'Please send me your latest team notes.' });

    expect(sendMessageResponse.statusCode).toBe(201);
    expect(sendMessageResponse.body.data.sender.role).toBe('admin');

    const coachMessagesResponse = await request(app)
      .get(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${coachToken}`);

    expect(coachMessagesResponse.statusCode).toBe(200);
    expect(coachMessagesResponse.body.data.messages).toHaveLength(1);
    expect(coachMessagesResponse.body.data.messages[0].content).toBe(
      'Please send me your latest team notes.'
    );
  });

  test('player can start a direct conversation with a teammate who shares the same team', async () => {
    const adminToken = await login('admin@agriguard.com', 'Admin@123!');
    const playerToken = await login('player@agriguard.com', 'Player@123!');
    const coachToken = await login('coach@agriguard.com', 'Coach@123!');
    const users = await listUsers(adminToken);
    const coachUser = users.find((user) => user.email === 'coach@agriguard.com');
    const playerUser = users.find((user) => user.email === 'player@agriguard.com');

    const inviteResponse = await request(app)
      .post('/api/auth/invitations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        fullName: 'Second Player',
        email: 'teammate@agriguard.com',
        role: 'player',
        teamId: '',
      });

    expect(inviteResponse.statusCode).toBe(201);

    const acceptInvitationResponse = await request(app)
      .post(`/api/auth/accept-invitation/${inviteResponse.body.data.rawToken}`)
      .send({
        fullName: 'Second Player',
        password: 'PlayerTwo@123!',
        confirmPassword: 'PlayerTwo@123!',
      });

    expect(acceptInvitationResponse.statusCode).toBe(200);

    const refreshedUsers = await listUsers(adminToken);
    const secondPlayerUser = refreshedUsers.find((user) => user.email === 'teammate@agriguard.com');

    const teamResponse = await createTeam(adminToken, {
      name: 'Lions',
      coachUserId: coachUser.id,
    });

    const firstPlayerResponse = await createPlayer(adminToken, {
      userId: playerUser.id,
      jerseyNumber: 9,
      preferredPosition: 'Outside Hitter',
    });

    await addPlayerToTeam(adminToken, teamResponse.body.data.id, firstPlayerResponse.body.data.id);
    const secondPlayerRecord = (
      await request(app).get('/api/players').set('Authorization', `Bearer ${adminToken}`)
    ).body.data.find((player) => player.user?.id === secondPlayerUser.id);

    expect(secondPlayerRecord).toBeTruthy();

    const existingMembership = secondPlayerRecord.team_membership?.team_id;
    if (existingMembership !== teamResponse.body.data.id) {
      await addPlayerToTeam(adminToken, teamResponse.body.data.id, secondPlayerRecord.id);
    }

    const listResponse = await request(app)
      .get('/api/conversations')
      .set('Authorization', `Bearer ${playerToken}`);

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.body.data.available_direct_targets).toHaveLength(2);
    expect(
      listResponse.body.data.available_direct_targets.some((target) => target.user.id === coachUser.id)
    ).toBe(true);
    expect(
      listResponse.body.data.available_direct_targets.some((target) => target.user.id === secondPlayerUser.id)
    ).toBe(true);

    const directConversationResponse = await request(app)
      .post('/api/conversations/direct')
      .set('Authorization', `Bearer ${playerToken}`)
      .send({ targetUserId: secondPlayerUser.id });

    expect(directConversationResponse.statusCode).toBe(201);
    expect(directConversationResponse.body.data.type).toBe('direct');

    const conversationId = directConversationResponse.body.data.id;
    const sendMessageResponse = await request(app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${playerToken}`)
      .send({ content: 'Hey, are you coming early for warmup?' });

    expect(sendMessageResponse.statusCode).toBe(201);

    const secondPlayerToken = await login('teammate@agriguard.com', 'PlayerTwo@123!');
    const secondPlayerMessagesResponse = await request(app)
      .get(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${secondPlayerToken}`);

    expect(secondPlayerMessagesResponse.statusCode).toBe(200);
    expect(secondPlayerMessagesResponse.body.data.messages).toHaveLength(1);
    expect(secondPlayerMessagesResponse.body.data.messages[0].content).toBe(
      'Hey, are you coming early for warmup?'
    );

    const coachListResponse = await request(app)
      .get('/api/conversations')
      .set('Authorization', `Bearer ${coachToken}`);

    expect(coachListResponse.statusCode).toBe(200);
    expect(coachListResponse.body.data.available_direct_targets).toHaveLength(2);
  });

  test('player cannot start a direct conversation with a team member from another team', async () => {
    const adminToken = await login('admin@agriguard.com', 'Admin@123!');
    const playerToken = await login('player@agriguard.com', 'Player@123!');
    const users = await listUsers(adminToken);
    const playerUser = users.find((user) => user.email === 'player@agriguard.com');

    const acceptInvitationResponse = await request(app)
      .post('/api/auth/accept-invitation/invite-coach-123')
      .send({
        fullName: 'Second Coach',
        password: 'CoachTwo@123!',
        confirmPassword: 'CoachTwo@123!',
      });

    expect(acceptInvitationResponse.statusCode).toBe(200);

    const refreshedUsers = await listUsers(adminToken);
    const secondCoach = refreshedUsers.find((user) => user.email === 'new.coach@agriguard.com');

    const playerRecordResponse = await createPlayer(adminToken, {
      userId: playerUser.id,
      jerseyNumber: 4,
      preferredPosition: 'Libero',
    });

    const playerTeamResponse = await createTeam(adminToken, {
      name: 'Sharks',
      coachUserId: null,
    });

    await addPlayerToTeam(adminToken, playerTeamResponse.body.data.id, playerRecordResponse.body.data.id);

    await createTeam(adminToken, {
      name: 'Bulls',
      coachUserId: secondCoach.id,
    });

    const directConversationResponse = await request(app)
      .post('/api/conversations/direct')
      .set('Authorization', `Bearer ${playerToken}`)
      .send({ targetUserId: secondCoach.id });

    expect(directConversationResponse.statusCode).toBe(403);
    expect(directConversationResponse.body.message).toBe(
      'Direct messages are only allowed between team members who currently share a team.'
    );
  });

  test('team chat only allows current team participants to read and send messages', async () => {
    const adminToken = await login('admin@agriguard.com', 'Admin@123!');
    const users = await listUsers(adminToken);
    const coachUser = users.find((user) => user.email === 'coach@agriguard.com');
    const playerUser = users.find((user) => user.email === 'player@agriguard.com');
    const playerToken = tokenForUser(playerUser);
    const coachToken = tokenForUser(coachUser);

    const teamResponse = await createTeam(adminToken, {
      name: 'Titans',
      coachUserId: coachUser.id,
    });
    const teamId = teamResponse.body.data.id;

    const playerResponse = await createPlayer(adminToken, {
      userId: playerUser.id,
      jerseyNumber: 11,
      preferredPosition: 'Outside Hitter',
    });

    await addPlayerToTeam(adminToken, teamId, playerResponse.body.data.id);

    const teamConversationResponse = await request(app)
      .post('/api/conversations/team')
      .set('Authorization', `Bearer ${playerToken}`)
      .send({ teamId });

    expect(teamConversationResponse.statusCode).toBe(201);
    expect(teamConversationResponse.body.data.type).toBe('team');

    const conversationId = teamConversationResponse.body.data.id;

    const sendMessageResponse = await request(app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${coachToken}`)
      .send({ content: 'Practice starts at 7 PM sharp.' });

    expect(sendMessageResponse.statusCode).toBe(201);
    expect(sendMessageResponse.body.data.sender.role).toBe('coach');

    const playerMessagesResponse = await request(app)
      .get(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${playerToken}`);

    expect(playerMessagesResponse.statusCode).toBe(200);
    expect(playerMessagesResponse.body.data.messages).toHaveLength(1);
    expect(playerMessagesResponse.body.data.messages[0].content).toBe('Practice starts at 7 PM sharp.');

    const adminMessagesResponse = await request(app)
      .get(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(adminMessagesResponse.statusCode).toBe(404);

    const adminSendMessageResponse = await request(app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ content: 'Admin should not be able to post here.' });

    expect(adminSendMessageResponse.statusCode).toBe(404);
  });

  test('pusher private-channel auth accepts form-encoded conversation authorization requests', async () => {
    const adminToken = await login('admin@agriguard.com', 'Admin@123!');
    const users = await listUsers(adminToken);
    const playerUser = users.find((user) => user.email === 'player@agriguard.com');
    const playerToken = tokenForUser(playerUser);

    const teamResponse = await createTeam(adminToken, {
      name: 'Realtime Team',
      coachUserId: null,
    });

    const playerResponse = await createPlayer(adminToken, {
      userId: playerUser.id,
      jerseyNumber: 6,
      preferredPosition: 'Middle Blocker',
    });

    await addPlayerToTeam(adminToken, teamResponse.body.data.id, playerResponse.body.data.id);

    const teamConversationResponse = await request(app)
      .post('/api/conversations/team')
      .set('Authorization', `Bearer ${playerToken}`)
      .send({ teamId: teamResponse.body.data.id });

    expect(teamConversationResponse.statusCode).toBe(201);

    const authResponse = await request(app)
      .post('/api/conversations/pusher/auth')
      .set('Authorization', `Bearer ${playerToken}`)
      .type('form')
      .send({
        socket_id: '123.456',
        channel_name: `private-conversation-${teamConversationResponse.body.data.id}`,
      });

    expect(authResponse.statusCode).toBe(200);
    expect(authResponse.body).toHaveProperty('auth');
  });

  test('pusher private-channel auth accepts the signed-in user channel and rejects other user channels', async () => {
    const db = await readDb();
    const playerUser = db.users.find((user) => user.email === 'player@agriguard.com');
    const playerToken = tokenForUser(playerUser);

    const ownChannelResponse = await request(app)
      .post('/api/conversations/pusher/auth')
      .set('Authorization', `Bearer ${playerToken}`)
      .type('form')
      .send({
        socket_id: '123.456',
        channel_name: `private-user-${playerUser.id}`,
      });

    expect(ownChannelResponse.statusCode).toBe(200);
    expect(ownChannelResponse.body).toHaveProperty('auth');

    const otherChannelResponse = await request(app)
      .post('/api/conversations/pusher/auth')
      .set('Authorization', `Bearer ${playerToken}`)
      .type('form')
      .send({
        socket_id: '123.456',
        channel_name: 'private-user-user-someone-else',
      });

    expect(otherChannelResponse.statusCode).toBe(403);
    expect(otherChannelResponse.body.message).toBe(
      'You do not have access to this realtime channel.'
    );
  });
});
