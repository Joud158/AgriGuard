import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import DashboardLayout from '../layouts/DashboardLayout';
import Toast from '../components/Toast';

import { useAuth } from '../context/AuthContext';
import {
  getConversationMessages,
  sendConversationMessage,
} from '../services/authApi';

import { getCurrentSocketId, getPusherClient, isPusherConfigured } from '../services/pusherClient';

function formatTimestamp(value) {
  if (!value) return '';

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';

  return parsed.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function upsertMessage(current, next) {
  if (!next?.id) {
    return current;
  }

  const existingIndex = current.findIndex((message) => message.id === next.id);
  if (existingIndex >= 0) {
    const updated = [...current];
    updated[existingIndex] = next;
    return updated;
  }

  return [...current, next].sort(
    (left, right) => new Date(left.created_at) - new Date(right.created_at)
  );
}

export default function ConversationThreadPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const role = user?.role || 'player';
  const messagesEndRef = useRef(null);

  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('error');
  const [realtimeAvailable, setRealtimeAvailable] = useState(false);

  async function loadThread(options = {}) {
    const { silent = false } = options;

    if (!silent) {
      setLoading(true);
      setMessage('');
    }

    const response = await getConversationMessages(id);

    if (!response.success) {
      if (!silent) {
        setMessageType('error');
        setMessage(response.message || 'Unable to load this conversation.');
        setConversation(null);
        setMessages([]);
      }

      setLoading(false);
      return false;
    }

    setConversation(response.data?.conversation || null);
    setMessages(Array.isArray(response.data?.messages) ? response.data.messages : []);
    window.dispatchEvent(new Event('notifications:refresh'));
    setLoading(false);
    return true;
  }

  useEffect(() => {
    let active = true;

    setLoading(true);
    setMessage('');

    loadThread().catch(() => {
      if (!active) return;
      setMessageType('error');
      setMessage('Unable to load this conversation right now.');
      setConversation(null);
      setMessages([]);
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!conversation?.channel_name || !conversation?.realtime_enabled || !isPusherConfigured()) {
      setRealtimeAvailable(false);
      return undefined;
    }

    const pusher = getPusherClient();

    if (!pusher) {
      setRealtimeAvailable(false);
      return undefined;
    }

    setRealtimeAvailable(true);

    const channel = pusher.subscribe(conversation.channel_name);

    const handleIncomingMessage = (incomingMessage) => {
      setMessages((current) => upsertMessage(current, incomingMessage));
      loadThread({ silent: true }).catch(() => {});
      window.dispatchEvent(new Event('notifications:refresh'));
    };

    const handleSubscriptionError = (error) => {
      console.warn('Thread realtime subscription failed:', error);
      setRealtimeAvailable(false);
    };

    channel.bind('message:new', handleIncomingMessage);
    channel.bind('pusher:subscription_error', handleSubscriptionError);

    return () => {
      channel.unbind('message:new', handleIncomingMessage);
      channel.unbind('pusher:subscription_error', handleSubscriptionError);
      pusher.unsubscribe(conversation.channel_name);
    };
  }, [conversation?.channel_name, conversation?.realtime_enabled, id]);

  // Polling fallback keeps the chat usable even if Pusher private-channel auth fails.
  useEffect(() => {
    if (loading || realtimeAvailable || !conversation) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      loadThread({ silent: true }).catch(() => {});
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [conversation, id, loading, realtimeAvailable]);

  const subtitle = useMemo(() => {
    if (!conversation) return '';

    if (conversation.type === 'team') {
      return conversation.team?.name || conversation.subtitle || '';
    }

    return conversation.subtitle || '';
  }, [conversation]);

  async function handleSubmit(event) {
    event.preventDefault();

    const content = draft.trim();
    if (!content) {
      return;
    }

    setSending(true);
    setMessage('');

    const response = await sendConversationMessage(id, {
      content,
      socketId: getCurrentSocketId(),
    });

    setSending(false);

    if (!response.success) {
      setMessageType('error');
      setMessage(response.message || 'Unable to send this message.');
      return;
    }

    setMessages((current) => upsertMessage(current, response.data));
    setDraft('');
    loadThread({ silent: true }).catch(() => {});
  }

  if (loading) {
    return (
      <DashboardLayout role={role}>
        <p className="loading-text">Loading conversation...</p>
      </DashboardLayout>
    );
  }

  if (!conversation) {
    return (
      <DashboardLayout role={role}>
        <div className="page-head">
          <div>
            <Link className="muted-page-link" to="/chat">
              Back to chat
            </Link>
            <h1>Conversation not found</h1>
          </div>
        </div>
        <Toast message={message} variant="error" />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role={role}>
      <div className="page-head">
        <div>
          <Link className="muted-page-link" to="/chat">
            Back to chat
          </Link>
          <h1>{conversation.title}</h1>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
      </div>

      <section className="dashboard-card chat-thread-card">
        <div className="chat-thread-status-row">
          {!realtimeAvailable ? <span className="pill-muted">Live sync fallback</span> : null}
        </div>

        <div className="chat-thread-messages">
          {messages.length === 0 ? (
            <div className="teams-note-card compact">
              <strong>No messages yet</strong>
              <p>Send the first message to start this conversation.</p>
            </div>
          ) : (
            messages.map((entry) => {
              const isOwnMessage = entry.sender_user_id === user?.id;

              return (
                <article
                  key={entry.id}
                  className={isOwnMessage ? 'chat-message-bubble mine' : 'chat-message-bubble'}
                >
                  <div className="chat-message-meta">
                    <strong>{isOwnMessage ? 'You' : entry.sender?.full_name || 'Unknown sender'}</strong>
                    <span>{formatTimestamp(entry.created_at)}</span>
                  </div>
                  <p>{entry.content}</p>
                </article>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        <form className="chat-compose-form" onSubmit={handleSubmit}>
          <textarea
            className="input chat-compose-input"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Type your message"
            rows={3}
            maxLength={2000}
          />
          <div className="chat-compose-actions">
            <button type="submit" className="primary-button" disabled={sending || !draft.trim()}>
              {sending ? 'Sending...' : 'Send'}
            </button>
          </div>
        </form>
      </section>

      <Toast message={message} variant={messageType} />
    </DashboardLayout>
  );
}
