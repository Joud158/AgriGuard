import React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import DashboardLayout from '../layouts/DashboardLayout';
import FormField from '../components/FormField';
import Toast from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import { getEvent, getTeams, updateEvent, deleteEvent } from '../services/authApi';
import { validateEvent } from '../utils/validation';

const EVENT_TYPES = [
  { value: 'training', label: 'Field scouting to-do' },
  { value: 'match', label: 'Agronomist field visit' },
  { value: 'meeting', label: 'Advisory call' },
  { value: 'other', label: 'Other farm task' },
];

function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function EditEventPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [values, setValues] = useState({
    title: '',
    type: '',
    teamId: '',
    description: '',
    location: '',
    startTime: '',
    endTime: '',
  });
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('success');
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [teams, setTeams] = useState([]);


  useEffect(() => {
    let active = true;

    async function load() {
      const [eventRes, teamsRes] = await Promise.all([
        getEvent(id),
        getTeams(),
      ]);

      if (!active) return;

      if (!eventRes.success) {
        setMessageType('error');
        setMessage(eventRes.message || 'Unable to load event.');
        setPageLoading(false);
        return;
      }

      if (teamsRes.success) {
        setTeams(teamsRes.data);
      }

      const evt = eventRes.data;
      setValues({
        title: evt.title || '',
        type: evt.type || '',
        teamId: evt.team_id || '',
        description: evt.description || '',
        location: evt.location || '',
        startTime: toLocalInput(evt.start_time),
        endTime: toLocalInput(evt.end_time),
      });
      setPageLoading(false);
    }

    load().catch(() => {
      if (!active) return;
      setMessageType('error');
      setMessage('Unable to load event right now.');
      setPageLoading(false);
    });

    return () => { active = false; };
  }, [id]);

  const role = user?.role || 'coach';
  const availableTeams = useMemo(
    () => (role === 'coach' ? teams.filter((team) => team.coach_user_id === user?.id) : teams),
    [role, teams, user?.id]
  );

  useEffect(() => {
    if (!availableTeams.length) {
      return;
    }

    setValues((current) => {
      if (availableTeams.some((team) => team.id === current.teamId)) {
        return current;
      }

      return {
        ...current,
        teamId: availableTeams[0].id,
      };
    });
  }, [availableTeams]);

  function handleChange(event) {
    const { name, value } = event.target;
    setValues((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: '' }));
    setMessage('');
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const nextErrors = validateEvent(values);
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length) {
      return;
    }

    setLoading(true);
    setMessage('');

    const response = await updateEvent(id, {
      title: values.title.trim(),
      type: values.type,
      teamId: values.teamId,
      description: values.description.trim(),
      location: values.location.trim(),
      startTime: new Date(values.startTime).toISOString(),
      endTime: new Date(values.endTime).toISOString(),
    });

    setLoading(false);

    if (!response.success) {
      setErrors(response.errors ?? {});
      setMessageType('error');
      setMessage(response.message || 'Unable to update event.');
      return;
    }

    setMessageType('success');
    setMessage('Event updated successfully.');
  }

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

  if (pageLoading) {
    return (
      <DashboardLayout role={role}>
        <p className="loading-text">Loading event...</p>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role={role}>
      <div className="page-head">
        <div>
          <h1>Edit Event</h1>
          <p>Update the details of this event.</p>
        </div>
        <Link to="/events" className="secondary-button">
          Back to Calendar
        </Link>
      </div>

      <div className="form-panel invite-panel">
        <form className="stack-form" onSubmit={handleSubmit}>
          <FormField
            label="Event Title"
            name="title"
            placeholder="e.g. North Olive Block inspection"
            value={values.title}
            onChange={handleChange}
            error={errors.title}
          />

          <FormField
            label="Event Type"
            name="type"
            error={errors.type}
            children={
              <select
                name="type"
                value={values.type}
                onChange={handleChange}
                className={errors.type ? 'input error' : 'input'}
              >
                <option value="">Select event type</option>
                {EVENT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            }
          />

          <FormField
            label="Field"
            name="teamId"
            error={errors.teamId}
            children={
              <select
                name="teamId"
                value={values.teamId}
                onChange={handleChange}
                className={errors.teamId ? 'input error' : 'input'}
              >
                <option value="">Select team</option>
                {availableTeams.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            }
          />

          <FormField
            label="Location"
            name="location"
            placeholder="e.g. Beirut Smart Agriculture Stadium"
            value={values.location}
            onChange={handleChange}
            error={errors.location}
          />

          <FormField
            label="Description"
            name="description"
            placeholder="Optional notes about this event"
            value={values.description}
            onChange={handleChange}
            error={errors.description}
          />

          <FormField
            label="Start Date & Time"
            name="startTime"
            type="datetime-local"
            value={values.startTime}
            onChange={handleChange}
            error={errors.startTime}
          />

          <FormField
            label="End Date & Time"
            name="endTime"
            type="datetime-local"
            value={values.endTime}
            onChange={handleChange}
            error={errors.endTime}
          />

          <div className="action-row">
            <button type="button" className="secondary-button" onClick={() => navigate('/events')}>
              Cancel
            </button>
            <button type="button" className="danger-button" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Deleting...' : 'Delete Event'}
            </button>
            <button type="submit" className="primary-button" disabled={loading}>
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>

      <Toast message={message} variant={messageType} />
    </DashboardLayout>
  );
}

