import React from 'react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import DashboardLayout from '../layouts/DashboardLayout';
import Toast from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import { getEvent, deleteEvent, getTeams } from '../services/authApi';

const TYPE_LABELS = {
  training: 'Field scouting to-do',
  match: 'Agronomist field visit',
  meeting: 'Advisory call',
  other: 'Other farm task',
};

function formatDateTime(iso) {
  if (!iso) return '\u2014';
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'short' });
}

export default function EventDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const role = user?.role || 'player';
  const canManage = role === 'admin';
  const canRequestEdit = role === 'coach';

  const [event, setEvent] = useState(null);
  const [teamName, setTeamName] = useState('');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('error');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([getEvent(id), getTeams()])
      .then(([eventRes, teamsRes]) => {
        if (!active) return;
        if (!eventRes.success) {
          setMessage(eventRes.message || 'Unable to load event.');
        } else {
          setEvent(eventRes.data);
          if (teamsRes.success && eventRes.data.team_id) {
            const field = teamsRes.data.find((t) => t.id === eventRes.data.team_id);
            if (field) setTeamName(field.name);
          }
        }
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setMessage('Unable to load event right now.');
        setLoading(false);
      });
    return () => { active = false; };
  }, [id]);

  async function handleDelete() {
    if (!window.confirm('Are you sure you want to delete this event? This cannot be undone.')) return;
    setDeleting(true);
    const response = await deleteEvent(id);
    setDeleting(false);
    if (!response.success) {
      setMessageType('error');
      setMessage(response.message || 'Unable to delete event.');
      return;
    }
    navigate('/events');
  }

  if (loading) {
    return (
      <DashboardLayout role={role}>
        <p className="loading-text">Loading event...</p>
      </DashboardLayout>
    );
  }

  if (!event) {
    return (
      <DashboardLayout role={role}>
        <Toast message={message} variant="error" />
        <div className="page-head">
          <h1>Event not found</h1>
        </div>
        <Link to="/events" className="secondary-button">Back to Calendar</Link>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role={role}>
      <div className="page-head">
        <div>
          <h1>{event.title}</h1>
          <p>{TYPE_LABELS[event.type] || event.type}</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          {canRequestEdit ? (
            <Link to={`/events/create?eventId=${encodeURIComponent(id)}`} className="secondary-button">
              Request Edit
            </Link>
          ) : null}
          {canManage && (
            <Link to={`/events/${id}/edit`} className="edit-btn-green">Edit</Link>
          )}
          {canManage && (
            <button type="button" className="danger-button" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Deleting...' : 'Delete Event'}
            </button>
          )}
          <Link to="/events" className="secondary-button">Back</Link>
        </div>
      </div>

      <div className="dashboard-card" style={{ maxWidth: 600 }}>
        <div className="event-detail-grid">
          <div className="event-detail-row">
            <span className="event-detail-label">Type</span>
            <span>{TYPE_LABELS[event.type] || event.type}</span>
          </div>
          {teamName && (
            <div className="event-detail-row">
              <span className="event-detail-label">Field</span>
              <span>{teamName}</span>
            </div>
          )}
          <div className="event-detail-row">
            <span className="event-detail-label">Start</span>
            <span>{formatDateTime(event.start_time)}</span>
          </div>
          <div className="event-detail-row">
            <span className="event-detail-label">End</span>
            <span>{formatDateTime(event.end_time)}</span>
          </div>
          <div className="event-detail-row">
            <span className="event-detail-label">Location</span>
            <span>{event.location || '\u2014'}</span>
          </div>
          <div className="event-detail-row">
            <span className="event-detail-label">Description</span>
            <span>{event.description || '\u2014'}</span>
          </div>
          <div className="event-detail-row">
            <span className="event-detail-label">Created</span>
            <span>{formatDateTime(event.created_at)}</span>
          </div>
          {event.updated_at && event.updated_at !== event.created_at && (
            <div className="event-detail-row">
              <span className="event-detail-label">Last Updated</span>
              <span>{formatDateTime(event.updated_at)}</span>
            </div>
          )}
        </div>
      </div>

      <Toast message={message} variant={messageType} />
    </DashboardLayout>
  );
}

