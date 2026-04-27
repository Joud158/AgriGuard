import React from 'react';
import { useEffect, useMemo, useState } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import Toast from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import { getMyHistory } from '../services/authApi';

function formatDateTime(value) {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleString();
}

function HistorySection({ title, children }) {
  return (
    <section className="dashboard-card" style={{ marginBottom: '1rem' }}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export default function MyHistoryPage() {
  const { user } = useAuth();
  const [history, setHistory] = useState(null);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('success');

  useEffect(() => {
    let active = true;

    async function loadHistory() {
      const response = await getMyHistory();
      if (!active) return;

      if (response.success) {
        setHistory(response.data);
      } else {
        setMessageType('error');
        setMessage(response.message || 'Unable to load your history right now.');
      }
    }

    loadHistory().catch(() => {
      if (!active) return;
      setMessageType('error');
      setMessage('Unable to load your history right now.');
    });

    return () => {
      active = false;
    };
  }, []);

  const eventHistory = useMemo(() => {
    const trainings = history?.training_history || [];
    const matches = history?.match_history || [];
    return [...trainings, ...matches].sort(
      (left, right) => new Date(right.start_time) - new Date(left.start_time)
    );
  }, [history]);

  return (
    <DashboardLayout role={user?.role || 'player'}>
      <section className="page-head compact">
  <div className="page-head-text">
    <h1>My history</h1>
    <p>
      Review your role changes, field assignment history, past events, announcements, and request activity.
    </p>
  </div>
</section>

      <HistorySection title="Account overview">
        <div className="section-row" style={{ gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <strong>Role:</strong> {history?.user?.role || user?.role || '-'}
          </div>
          <div>
            <strong>Status:</strong> {history?.user ? (history.user.is_active ? 'active' : 'inactive') : '-'}
          </div>
          <div>
            <strong>Current team:</strong> {history?.user?.assigned_team || user?.team || '-'}
          </div>
          <div>
            <strong>Last login:</strong> {formatDateTime(history?.user?.last_login_at || user?.lastLoginAt)}
          </div>
        </div>
      </HistorySection>

      <HistorySection title="Role history">
        <table className="data-table">
          <thead>
            <tr>
              <th>Old Role</th>
              <th>New Role</th>
              <th>Changed By</th>
              <th>Changed At</th>
            </tr>
          </thead>
          <tbody>
            {(history?.role_history || []).map((entry) => (
              <tr key={entry.id}>
                <td>{entry.old_role || 'initial'}</td>
                <td>{entry.new_role || '-'}</td>
                <td>{entry.changed_by?.full_name || '-'}</td>
                <td>{formatDateTime(entry.changed_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </HistorySection>

      <HistorySection title="Field assignment history">
        <table className="data-table">
          <thead>
            <tr>
              <th>Previous Team</th>
              <th>New Team</th>
              <th>Change Type</th>
              <th>Changed By</th>
              <th>Changed At</th>
            </tr>
          </thead>
          <tbody>
            {(history?.team_assignment_history || []).map((entry) => (
              <tr key={entry.id}>
                <td>{entry.old_team_name || '-'}</td>
                <td>{entry.new_team_name || '-'}</td>
                <td>{entry.change_type}</td>
                <td>{entry.changed_by?.full_name || '-'}</td>
                <td>{formatDateTime(entry.changed_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </HistorySection>

      <HistorySection title="Past events">
        <table className="data-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Type</th>
              <th>Field</th>
              <th>Start</th>
              <th>Location</th>
            </tr>
          </thead>
          <tbody>
            {eventHistory.map((event) => (
              <tr key={event.id}>
                <td>{event.title}</td>
                <td>{event.type}</td>
                <td>{event.team?.name || '-'}</td>
                <td>{formatDateTime(event.start_time)}</td>
                <td>{event.location || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </HistorySection>

      <HistorySection title="Announcements">
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          {(history?.announcement_history || []).map((announcement) => (
            <article key={announcement.id} className="dashboard-card" style={{ padding: '1rem' }}>
              <div className="section-row">
                <strong>{announcement.title}</strong>
                <span className="role-badge">{announcement.audience_label}</span>
              </div>
              <p style={{ margin: '0.5rem 0' }}>{announcement.message}</p>
              <small style={{ color: 'var(--muted)' }}>
                Posted by {announcement.sender?.full_name || 'Unknown'} on {formatDateTime(announcement.created_at)}
              </small>
            </article>
          ))}
        </div>
      </HistorySection>

      {user?.role === 'coach' || (history?.player_add_request_history || []).length > 0 ? (
        <HistorySection title="Requests history">
          {(history?.event_request_history || []).length > 0 ? (
            <div style={{ marginBottom: '1rem' }}>
              <h3 style={{ marginBottom: '0.5rem' }}>Event requests</h3>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Status</th>
                    <th>Field</th>
                    <th>Created At</th>
                    <th>Reviewed At</th>
                  </tr>
                </thead>
                <tbody>
                  {(history?.event_request_history || []).map((request) => (
                    <tr key={request.id}>
                      <td>{request.current_title}</td>
                      <td>{request.status}</td>
                      <td>{request.team?.name || '-'}</td>
                      <td>{formatDateTime(request.created_at)}</td>
                      <td>{formatDateTime(request.final_reviewed_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          <h3 style={{ marginBottom: '0.5rem' }}>Player add requests</h3>
          <table className="data-table">
            <thead>
              <tr>
                <th>Farmer</th>
                <th>Agronomist</th>
                <th>Field</th>
                <th>Status</th>
                <th>Created At</th>
                <th>Reviewed At</th>
              </tr>
            </thead>
            <tbody>
              {(history?.player_add_request_history || []).map((request) => (
                <tr key={request.id}>
                  <td>{request.player?.user?.full_name || '-'}</td>
                  <td>{request.coach?.full_name || '-'}</td>
                  <td>{request.team?.name || '-'}</td>
                  <td>{request.status}</td>
                  <td>{formatDateTime(request.created_at)}</td>
                  <td>{formatDateTime(request.reviewed_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </HistorySection>
      ) : null}

      <HistorySection title="Audit log">
        <table className="data-table">
          <thead>
            <tr>
              <th>Action</th>
              <th>Summary</th>
              <th>When</th>
            </tr>
          </thead>
          <tbody>
            {(history?.audit_log || []).map((entry) => (
              <tr key={entry.id}>
                <td>{entry.action_type}</td>
                <td>{entry.summary}</td>
                <td>{formatDateTime(entry.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </HistorySection>

      <Toast message={message} variant={messageType} />
    </DashboardLayout>
  );
}

