import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import DashboardLayout from '../layouts/DashboardLayout';
import Toast from '../components/Toast';

import { useAuth } from '../context/AuthContext';
import {
  getConversations,
  createDirectConversation,
  createTeamConversation,
} from '../services/authApi';

import { getPusherClient, isPusherConfigured } from '../services/pusherClient';

function formatTimestamp(value) {
  if (!value) return '';

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';

  return parsed.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function buildPreview(message) {
  const text = String(message?.content || '').trim();

  if (!text) return 'No messages yet.';
  if (text.length <= 80) return text;

  return `${text.slice(0, 80).trimEnd()}...`;
}

function getRoleLabel(role) {
  if (role === 'admin') return 'Administrator';
  if (role === 'coach') return 'Agronomist';
  if (role === 'player') return 'Farmer';
  return role || 'User';
}

function buildUnreadLabel(unreadCount) {
  if (!unreadCount || unreadCount < 1) {
    return '';
  }

  return unreadCount === 1 ? 'New' : `${unreadCount} new`;
}

export default function ConversationsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const role = user?.role || 'player';
  const isAdmin = role === 'admin';

  const [payload, setPayload] = useState({
    conversations: [],
    available_team_chats: [],
    available_direct_targets: [],
    realtime_enabled: false,
  });

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('error');
  const [openingKey, setOpeningKey] = useState('');
  const [showNewChatPicker, setShowNewChatPicker] = useState(false);
  const [realtimeAvailable, setRealtimeAvailable] = useState(false);

  const loadConversations = useCallback(async (options = {}) => {
    const { silent = false } = options;

    if (!silent) {
      setLoading(true);
      setMessage('');
    }

    const response = await getConversations();

    if (!response.success) {
      setMessageType('error');

      if (!silent) {
        setMessage(response.message || 'Unable to load conversations.');
        setPayload({
          conversations: [],
          available_team_chats: [],
          available_direct_targets: [],
          realtime_enabled: false,
        });
      }

      setLoading(false);
      return false;
    }

    setPayload({
      conversations: Array.isArray(response.data?.conversations)
        ? response.data.conversations
        : [],
      available_team_chats: Array.isArray(response.data?.available_team_chats)
        ? response.data.available_team_chats
        : [],
      available_direct_targets: Array.isArray(response.data?.available_direct_targets)
        ? response.data.available_direct_targets
        : [],
      realtime_enabled: Boolean(response.data?.realtime_enabled),
    });

    setLoading(false);
    return true;
  }, []);

  useEffect(() => {
    let active = true;

    loadConversations().catch(() => {
      if (!active) return;

      setMessageType('error');
      setMessage('Unable to load conversations right now.');
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [loadConversations]);

  useEffect(() => {
    if (!user?.id || !payload.realtime_enabled || !isPusherConfigured()) {
      setRealtimeAvailable(false);
      return undefined;
    }

    const pusher = getPusherClient();

    if (!pusher) {
      setRealtimeAvailable(false);
      return undefined;
    }

    setRealtimeAvailable(true);

    const channelName = `private-user-${user.id}`;
    const channel = pusher.subscribe(channelName);

    const handleConversationRefresh = () => {
      loadConversations({ silent: true }).catch(() => {});
      window.dispatchEvent(new Event('notifications:refresh'));
    };

    const handleSubscriptionError = (error) => {
      console.warn('Conversation realtime subscription failed:', error);
      setRealtimeAvailable(false);
    };

    channel.bind('conversation:refresh', handleConversationRefresh);
    channel.bind('pusher:subscription_error', handleSubscriptionError);

    return () => {
      channel.unbind('conversation:refresh', handleConversationRefresh);
      channel.unbind('pusher:subscription_error', handleSubscriptionError);
      pusher.unsubscribe(channelName);
    };
  }, [loadConversations, payload.realtime_enabled, user?.id]);

  // Safe fallback: even if Pusher is not available or private-channel auth fails,
  // chat keeps updating without logging the user out.
  useEffect(() => {
    if (realtimeAvailable) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      loadConversations({ silent: true }).catch(() => {});
    }, 7000);

    return () => window.clearInterval(intervalId);
  }, [loadConversations, realtimeAvailable]);

  const conversations = useMemo(
    () => payload.conversations || [],
    [payload.conversations]
  );

  const availableTeamChats = useMemo(
    () => payload.available_team_chats || [],
    [payload.available_team_chats]
  );

  const availableDirectTargets = useMemo(
    () => payload.available_direct_targets || [],
    [payload.available_direct_targets]
  );

  function handleOpenConversation(conversationId) {
    navigate(`/chat/${conversationId}`);
  }

  async function handleOpenDirect(target) {
    if (target.conversation_id) {
      navigate(`/chat/${target.conversation_id}`);
      return;
    }

    setOpeningKey(`direct-${target.user.id}`);
    setMessage('');

    const response = await createDirectConversation({
      targetUserId: target.user.id,
    });

    setOpeningKey('');

    if (!response.success) {
      setMessageType('error');
      setMessage(response.message || 'Unable to open this direct chat.');
      return;
    }

    navigate(`/chat/${response.data.id}`);
  }

  async function handleOpenTeamChat(teamChat) {
    if (teamChat.conversation_id) {
      navigate(`/chat/${teamChat.conversation_id}`);
      return;
    }

    setOpeningKey(`team-${teamChat.team.id}`);
    setMessage('');

    const response = await createTeamConversation({
      teamId: teamChat.team.id,
    });

    setOpeningKey('');

    if (!response.success) {
      setMessageType('error');
      setMessage(response.message || 'Unable to open this field chat.');
      return;
    }

    navigate(`/chat/${response.data.id}`);
  }

  function renderDirectTargetDescription(target) {
    const sharedTeams = Array.isArray(target.shared_team_names)
      ? target.shared_team_names.join(', ')
      : '';

    if (sharedTeams) {
      return `Shared field group${target.shared_team_names.length > 1 ? 's' : ''}: ${sharedTeams}`;
    }

    if (role === 'admin') {
      return `${getRoleLabel(target.user.role)} in this farm network`;
    }

    return 'Direct conversation';
  }

  return (
    <DashboardLayout role={role}>
      <div className="page-head">
        <div>
          <h1>Chat</h1>
          <p>Direct messaging and field group chat live here.</p>
        </div>
      </div>

      {loading ? (
        <p className="loading-text">Loading conversations...</p>
      ) : (
        <>
          {showNewChatPicker ? (
            <div
              className="chat-picker-overlay"
              onClick={() => setShowNewChatPicker(false)}
            >
              <section
                className="dashboard-card chat-card chat-picker-modal"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="chat-picker-modal-head">
                  <div>
                    <h2>Start a Direct Chat</h2>
                    <p>
                      {role === 'admin'
                        ? 'Select an active farmer or agronomist in your farm network.'
                        : 'Select an available administrator, farmer, or agronomist connected to your field network.'}
                    </p>
                  </div>

                  <button
                    type="button"
                    className="chat-picker-close"
                    onClick={() => setShowNewChatPicker(false)}
                    aria-label="Close new chat picker"
                  >
                    ×
                  </button>
                </div>

                {availableDirectTargets.length === 0 ? (
                  <div className="teams-note-card compact">
                    <strong>No direct chat targets available</strong>
                    <p>
                      Create farmers or agronomists first, or assign users to
                      field groups so they become available for direct chat.
                    </p>
                  </div>
                ) : (
                  <div className="chat-quick-list">
                    {availableDirectTargets.map((target) => {
                      const key = `direct-${target.user.id}`;
                      const isOpening = openingKey === key;

                      return (
                        <div key={target.user.id} className="chat-quick-item">
                          <div>
                            <strong>{target.user.full_name}</strong>
                            <p>{renderDirectTargetDescription(target)}</p>
                          </div>

                          <button
                            type="button"
                            className="secondary-button small"
                            onClick={() => handleOpenDirect(target)}
                            disabled={isOpening}
                          >
                            {isOpening
                              ? 'Opening...'
                              : target.conversation_id
                                ? 'Open'
                                : 'Start'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
          ) : null}

          <div className="chat-page-grid">
            <section className="dashboard-card chat-card">
              <div className="chat-card-head">
                <div>
                  <h2>Conversations</h2>
                  <p>Your saved direct and field chats.</p>
                </div>

                {!realtimeAvailable ? (
                  <span className="pill-muted">Live sync fallback</span>
                ) : null}
              </div>

              {conversations.length === 0 ? (
                <div className="teams-note-card compact">
                  <strong>No conversations yet</strong>
                  <p>
                    Use the + button to start a direct chat. Field chats appear
                    when you are connected to a field group.
                  </p>
                </div>
              ) : (
                <div className="chat-conversation-list">
                  {conversations.map((conversation) => (
                    <button
                      key={conversation.id}
                      type="button"
                      className={
                        conversation.has_unread
                          ? 'chat-conversation-item unread'
                          : 'chat-conversation-item'
                      }
                      onClick={() => handleOpenConversation(conversation.id)}
                    >
                      <div className="chat-conversation-main">
                        <div className="chat-conversation-topline">
                          <div className="chat-conversation-title-row">
                            <strong>{conversation.title}</strong>

                            {conversation.has_unread ? (
                              <span className="chat-unread-pill">
                                {buildUnreadLabel(conversation.unread_count)}
                              </span>
                            ) : null}
                          </div>

                          <span>
                            {formatTimestamp(
                              conversation.last_message?.created_at || conversation.updated_at
                            )}
                          </span>
                        </div>

                        {conversation.subtitle ? (
                          <p className="chat-conversation-subtitle">
                            {conversation.subtitle}
                          </p>
                        ) : null}

                        <p
                          className={
                            conversation.has_unread
                              ? 'chat-conversation-preview unread'
                              : 'chat-conversation-preview'
                          }
                        >
                          {buildPreview(conversation.last_message)}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </section>

            {!isAdmin ? (
              <section className="dashboard-card chat-card">
                <div className="chat-card-head">
                  <div>
                    <h2>Quick Access</h2>
                    <p>
                      Open your field chats here. Use the + button to start a
                      direct chat.
                    </p>
                  </div>
                </div>

                {availableTeamChats.length === 0 ? (
                  <div className="teams-note-card compact">
                    <strong>No field chats available</strong>
                    <p>
                      Field chats will appear here when you are assigned to a
                      field group.
                    </p>
                  </div>
                ) : (
                  <div className="chat-quick-sections">
                    <div className="chat-quick-section">
                      <h3>Field Group Chats</h3>

                      <div className="chat-quick-list">
                        {availableTeamChats.map((teamChat) => {
                          const key = `team-${teamChat.team.id}`;
                          const isOpening = openingKey === key;

                          return (
                            <div key={teamChat.team.id} className="chat-quick-item">
                              <div>
                                <strong>{teamChat.title}</strong>
                                <p>
                                  {teamChat.conversation_id
                                    ? 'Open the existing field group thread.'
                                    : 'Create this field group thread.'}
                                </p>
                              </div>

                              <button
                                type="button"
                                className="secondary-button small"
                                onClick={() => handleOpenTeamChat(teamChat)}
                                disabled={isOpening}
                              >
                                {isOpening
                                  ? 'Opening...'
                                  : teamChat.conversation_id
                                    ? 'Open'
                                    : 'Create'}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </section>
            ) : null}
          </div>

          <button
            type="button"
            className={showNewChatPicker ? 'chat-fab-button open' : 'chat-fab-button'}
            onClick={() => setShowNewChatPicker((current) => !current)}
            aria-label="Start a new direct chat"
            aria-expanded={showNewChatPicker}
          >
            +
          </button>
        </>
      )}

      <Toast message={message} variant={messageType} />
    </DashboardLayout>
  );
}
