import React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '../layouts/DashboardLayout';
import FormField from '../components/FormField';
import Toast from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import { createEvent, createEventRequest, getEventOverlaps, getTeams } from '../services/authApi';

const EVENT_TYPES = [
  { value: 'training', label: 'Field scouting to-do' },
  { value: 'match', label: 'Agronomist field visit' },
  { value: 'meeting', label: 'Advisory call' },
  { value: 'other', label: 'Other farm task' },
];

const initialValues = {
  title: '',
  type: 'match',
  teamId: '',
  location: '',
  description: '',
  startTime: '',
  endTime: '',
};

function toIso(localValue) {
  return new Date(localValue).toISOString();
}

function formatTimeRange(startTime, endTime) {
  if (!startTime || !endTime) return '—';
  return `${new Date(startTime).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })} → ${new Date(endTime).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
}

function validate(values) {
  const errors = {};
  if (!values.title.trim()) errors.title = 'Title is required.';
  if (!values.type) errors.type = 'Type is required.';
  if (!values.teamId) errors.teamId = 'Field is required.';
  if (!values.startTime) errors.startTime = 'Start time is required.';
  if (!values.endTime) errors.endTime = 'End time is required.';
  if (values.startTime && values.endTime && new Date(values.endTime) <= new Date(values.startTime)) {
    errors.endTime = 'End time must be after start time.';
  }
  return errors;
}

export default function CreateEventPage() {
  const { user } = useAuth();
  const role = user?.role || 'player';
  const isAdmin = role === 'admin';
  const [values, setValues] = useState(initialValues);
  const [teams, setTeams] = useState([]);
  const [errors, setErrors] = useState({});
  const [loadingTeams, setLoadingTeams] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('success');
  const [createdItem, setCreatedItem] = useState(null);
  const [overlapWarnings, setOverlapWarnings] = useState([]);
  const [checkingOverlaps, setCheckingOverlaps] = useState(false);

  useEffect(() => {
    let active = true;
    getTeams()
      .then((response) => {
        if (!active) return;
        if (!response.success) {
          setMessageType('error');
          setMessage(response.message || 'Unable to load fields.');
          setTeams([]);
          return;
        }
        setTeams(response.data || []);
      })
      .catch(() => {
        if (!active) return;
        setMessageType('error');
        setMessage('Unable to load fields right now.');
      })
      .finally(() => active && setLoadingTeams(false));
    return () => { active = false; };
  }, []);

  const availableTeams = useMemo(() => {
    if (isAdmin) return teams;
    if (!user?.team) return teams;
    const assigned = teams.filter((team) => team.name === user.team || user.team.includes(team.name));
    return assigned.length ? assigned : teams;
  }, [isAdmin, teams, user?.team]);

  useEffect(() => {
    if (!values.teamId && availableTeams.length) {
      setValues((current) => ({ ...current, teamId: availableTeams[0].id }));
    }
  }, [availableTeams, values.teamId]);

  useEffect(() => {
    if (!values.startTime || !values.endTime || !values.teamId || new Date(values.endTime) <= new Date(values.startTime)) {
      setOverlapWarnings([]);
      return;
    }
    let active = true;
    setCheckingOverlaps(true);
    getEventOverlaps({ startTime: toIso(values.startTime), endTime: toIso(values.endTime), teamId: values.teamId })
      .then((response) => {
        if (!active) return;
        setOverlapWarnings(response.success ? response.data?.conflicts || [] : []);
      })
      .catch(() => active && setOverlapWarnings([]))
      .finally(() => active && setCheckingOverlaps(false));
    return () => { active = false; };
  }, [values.startTime, values.endTime, values.teamId]);

  function handleChange(event) {
    const { name, value } = event.target;
    setValues((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: '' }));
    setMessage('');
    setCreatedItem(null);
  }

  function clearForm() {
    setValues({ ...initialValues, teamId: availableTeams[0]?.id || '' });
    setErrors({});
    setCreatedItem(null);
    setMessage('');
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const nextErrors = validate(values);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    if (overlapWarnings.length) {
      const ok = window.confirm(`This time conflicts with ${overlapWarnings.length} existing calendar item${overlapWarnings.length === 1 ? '' : 's'}. Continue anyway?`);
      if (!ok) return;
    }

    const payload = {
      title: values.title.trim(),
      type: values.type,
      teamId: values.teamId,
      location: values.location.trim(),
      description: values.description.trim(),
      notes: values.description.trim(),
      startTime: toIso(values.startTime),
      endTime: toIso(values.endTime),
    };

    setSubmitting(true);
    const response = isAdmin ? await createEvent(payload) : await createEventRequest(payload);
    setSubmitting(false);

    if (!response.success) {
      setMessageType('error');
      setMessage(response.message || (isAdmin ? 'Unable to add this to-do.' : 'Unable to send request.'));
      setErrors(response.errors || {});
      return;
    }

    setCreatedItem(response.data);
    setMessageType('success');
    setMessage(isAdmin ? 'Farmer calendar to-do added successfully.' : 'Request sent for review.');
  }

  return (
    <DashboardLayout role={role}>
      <section className="page-head compact">
        <div>
          <span className="hero-eyebrow">{isAdmin ? 'Admin calendar control' : 'Farmer → agronomist request'}</span>
          <h1>{isAdmin ? 'Add Farmer To-Do' : 'Request an Agronomist'}</h1>
          <p>
            {isAdmin
              ? 'Create field tasks, inspection reminders, or advisory calls directly on the farmer calendar.'
              : 'Ask the assigned agronomist to visit, inspect, or talk through a crop issue. They can approve or reject based on conflicts.'}
          </p>
        </div>
        <Link className="secondary-button" to={isAdmin ? '/events' : '/event-requests'}>
          {isAdmin ? 'View Calendar' : 'My Requests'}
        </Link>
      </section>

      <div className="form-panel invite-panel">
        <form className="stack-form" onSubmit={handleSubmit}>
          <FormField label={isAdmin ? 'To-do title' : 'Request title'} name="title" placeholder={isAdmin ? 'Inspect North Olive Block' : 'Need agronomist inspection for leaf spots'} value={values.title} onChange={handleChange} error={errors.title} />

          <FormField label="Type" name="type" error={errors.type} children={
            <select name="type" value={values.type} onChange={handleChange} className={errors.type ? 'input error' : 'input'}>
              {EVENT_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
            </select>
          } />

          {isAdmin ? (
            <FormField label="Field" name="teamId" error={errors.teamId} children={
              <select name="teamId" value={values.teamId} onChange={handleChange} className={errors.teamId ? 'input error' : 'input'} disabled={loadingTeams}>
                <option value="">{loadingTeams ? 'Loading fields...' : 'Select field'}</option>
                {availableTeams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
              </select>
            } />
          ) : null}

          <FormField label="Location" name="location" placeholder="Farm gate, greenhouse, block number..." value={values.location} onChange={handleChange} error={errors.location} />

          <FormField label={isAdmin ? 'Instructions for farmer' : 'Problem details'} name="description" error={errors.description} children={
            <textarea name="description" value={values.description} onChange={handleChange} placeholder={isAdmin ? 'What should the farmer do or prepare?' : 'Describe symptoms, affected rows, urgency, and any photo/satellite signals.'} className="input" rows={5} />
          } />

          <FormField label="Start date & time" name="startTime" type="datetime-local" value={values.startTime} onChange={handleChange} error={errors.startTime} />
          <FormField label="End date & time" name="endTime" type="datetime-local" value={values.endTime} onChange={handleChange} error={errors.endTime} />

          {values.startTime && values.endTime ? (
            <section className="event-overlap-panel" aria-live="polite">
              <div className="event-overlap-panel-header">
                <div>
                  <h3>Calendar conflict check</h3>
                  <p>{checkingOverlaps ? 'Checking overlapping visits...' : 'Agronomists can see these conflicts before accepting.'}</p>
                </div>
                <span className="event-overlap-badge">{overlapWarnings.length} conflict{overlapWarnings.length === 1 ? '' : 's'}</span>
              </div>
              {overlapWarnings.length ? (
                <div className="event-overlap-list">
                  {overlapWarnings.map((warning) => (
                    <article key={warning.event.id} className="event-overlap-card">
                      <strong>{warning.event.title}</strong>
                      <p>{formatTimeRange(warning.event.start_time, warning.event.end_time)}</p>
                      <p>{warning.team?.name || 'Unknown field'} · overlaps by {warning.overlap_minutes} minutes</p>
                    </article>
                  ))}
                </div>
              ) : <p className="teams-note-card compact">No conflicts detected for the selected time.</p>}
            </section>
          ) : null}

          <div className="action-row">
            <button type="button" className="secondary-button" onClick={clearForm}>Clear</button>
            <button type="submit" className="primary-button" disabled={submitting || loadingTeams}>
              {submitting ? 'Saving...' : isAdmin ? 'Add To-Do' : 'Send Request'}
            </button>
          </div>
        </form>
      </div>

      {createdItem ? (
        <div className="preview-link-box">
          <strong>{createdItem.current_title || createdItem.title}</strong> was {isAdmin ? 'added to the calendar' : 'sent to the agronomist'}.{' '}
          <Link to={isAdmin ? '/events' : `/event-requests/${createdItem.id}`}>{isAdmin ? 'Open calendar' : 'Open request'}</Link>
        </div>
      ) : null}

      <Toast message={message} variant={messageType} />
    </DashboardLayout>
  );
}

