import React from 'react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import DashboardLayout from '../layouts/DashboardLayout';
import Toast from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import { assignEventRequestAgronomist, approveEventRequest, getEventRequest, getUsers, rejectEventRequest } from '../services/authApi';

const STATUS_LABELS = {
  pending_admin_review: 'Admin Review',
  pending_coach_review: 'Agronomist Review',
  approved: 'Approved',
  rejected: 'Rejected',
};

function formatDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function StatusPill({ status }) {
  return <span className={`request-status-pill request-status-${status}`}>{STATUS_LABELS[status] || status}</span>;
}

export default function EventRequestDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const role = user?.role || 'player';
  const isAgronomist = role === 'coach';
  const isAdmin = role === 'admin';
  const [request, setRequest] = useState(null);
  const [agronomists, setAgronomists] = useState([]);
  const [selectedAgronomistId, setSelectedAgronomistId] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('error');

  useEffect(() => {
    let active = true;
    getEventRequest(id)
      .then((response) => {
        if (!active) return;
        if (!response.success) {
          setMessageType('error');
          setMessage(response.message || 'Unable to load this request.');
          setRequest(null);
          return;
        }
        setRequest(response.data);
      })
      .catch(() => {
        if (!active) return;
        setMessageType('error');
        setMessage('Unable to load this request right now.');
      })
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [id]);

  useEffect(() => {
    if (!isAdmin) return undefined;

    let active = true;

    getUsers()
      .then((response) => {
        if (!active || !response.success) return;

        const availableAgronomists = (response.data || []).filter((entry) => {
          const role = String(entry.role || '').toLowerCase();
          const isAgronomist = role === 'coach' || role === 'agronomist';
          const isAvailable = entry.isActive !== false && entry.status !== 'inactive';
          return isAgronomist && isAvailable;
        });

        setAgronomists(availableAgronomists);
        setSelectedAgronomistId((current) => current || availableAgronomists[0]?.id || '');
      })
      .catch(() => {
        if (active) setAgronomists([]);
      });

    return () => {
      active = false;
    };
  }, [isAdmin]);

  async function handleAssign() {
    const coachUserId = selectedAgronomistId || agronomists[0]?.id || '';

    if (!coachUserId) {
      setMessageType('error');
      setMessage('Create or activate an agronomist before assigning this request.');
      return;
    }

    setSubmitting(true);
    const response = await assignEventRequestAgronomist(id, { coachUserId });
    setSubmitting(false);

    if (!response.success) {
      setMessageType('error');
      setMessage(response.message || 'Unable to assign this agronomist.');
      return;
    }

    setRequest(response.data);
    setMessageType('success');
    setMessage('Agronomist assigned. The request is now waiting for agronomist review.');
  }

  async function handleApprove() {
    if (request?.overlap_warnings?.length) {
      const confirmed = window.confirm(`This request overlaps with ${request.overlap_warnings.length} existing calendar item${request.overlap_warnings.length === 1 ? '' : 's'}. Accept anyway?`);
      if (!confirmed) return;
    }
    setSubmitting(true);
    const response = await approveEventRequest(id);
    setSubmitting(false);
    if (!response.success) {
      setMessageType('error');
      setMessage(response.message || 'Unable to accept this request.');
      return;
    }
    setRequest(response.data);
    setMessageType('success');
    setMessage('Request accepted and added to the calendar.');
  }

  async function handleReject() {
    const reason =
      isAgronomist && request?.status === 'pending_coach_review'
        ? window.prompt('Explain why you cannot take this request. The admin will be notified:', '') ?? ''
        : window.prompt('Optional rejection reason:', '') ?? '';

    setSubmitting(true);
    const response = await rejectEventRequest(id, { reason });
    setSubmitting(false);

    if (!response.success) {
      setMessageType('error');
      setMessage(response.message || 'Unable to update this request.');
      return;
    }

    setRequest(response.data);
    setMessageType('success');
    setMessage(
      response.data?.status === 'pending_admin_review'
        ? 'Admin notified. The request is back for agronomist reassignment.'
        : 'Request rejected.'
    );
  }

  if (loading) {
    return <DashboardLayout role={role}><p className="loading-text">Loading request...</p></DashboardLayout>;
  }

  if (!request) {
    return (
      <DashboardLayout role={role}>
        <div className="page-head"><div><Link className="muted-page-link" to="/event-requests">Back to requests</Link><h1>Request not found</h1></div></div>
        <Toast message={message} variant="error" />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role={role}>
      <section className="page-head compact">
        <div>
          <Link className="muted-page-link" to="/event-requests">Back to requests</Link>
          <span className="hero-eyebrow">Agronomist support request</span>
          <h1>{request.current_title}</h1>
          <p>{request.team?.name || 'Unknown field'} · <StatusPill status={request.status} /></p>
        </div>
        <div className="head-actions">
          {request.status === 'approved' && request.finalized_event_id ? <Link to="/events" className="secondary-button">Open Calendar</Link> : null}
          {isAgronomist && request.status === 'pending_coach_review' ? (
            <>
              <button type="button" className="secondary-button" onClick={handleReject} disabled={submitting}>{submitting ? 'Working...' : 'Cannot Take'}</button>
              <button type="button" className="primary-button" onClick={handleApprove} disabled={submitting}>{submitting ? 'Working...' : 'Accept'}</button>
            </>
          ) : null}

          {isAdmin && request.status === 'pending_admin_review' ? (
            agronomists.length ? (
              <div className="request-detail-assign-actions">
                <select
                  className="input request-assign-select"
                  value={selectedAgronomistId || agronomists[0]?.id || ''}
                  onChange={(event) => setSelectedAgronomistId(event.target.value)}
                >
                  {agronomists.map((agronomist) => (
                    <option key={agronomist.id} value={agronomist.id}>
                      {agronomist.fullName}
                    </option>
                  ))}
                </select>
                <button type="button" className="primary-button" onClick={handleAssign} disabled={submitting}>
                  {submitting ? 'Assigning...' : 'Assign Agronomist'}
                </button>
                <button type="button" className="secondary-button" onClick={handleReject} disabled={submitting}>
                  Reject
                </button>
              </div>
            ) : (
              <div className="request-no-agronomists">
                <span>No available agronomists</span>
                <Link to="/admin/create-user" className="secondary-button">Create Agronomist</Link>
              </div>
            )
          ) : null}
        </div>
      </section>

      <section className="event-detail-grid">
        <article className="dashboard-card">
          <h2>Request details</h2>
          <div className="detail-list">
            <div><span>Farmer</span><strong>{request.farmer?.full_name || '—'}</strong></div>
            <div><span>Agronomist</span><strong>{request.agronomist?.full_name || request.coach?.full_name || 'Not assigned yet'}</strong></div>
            <div><span>Start</span><strong>{formatDateTime(request.current_start_time)}</strong></div>
            <div><span>End</span><strong>{formatDateTime(request.current_end_time)}</strong></div>
            <div><span>Location</span><strong>{request.current_location || 'Not specified'}</strong></div>
            <div><span>Notes</span><strong>{request.current_notes || 'No notes provided.'}</strong></div>
          </div>
        </article>

        <article className="dashboard-card">
          <div className="section-row"><h2>Calendar conflicts</h2><span className="event-overlap-badge">{request.overlap_warnings?.length || 0}</span></div>
          {request.overlap_warnings?.length ? (
            <div className="event-overlap-list">
              {request.overlap_warnings.map((warning) => (
                <div key={warning.event.id} className="event-overlap-card">
                  <strong>{warning.event.title}</strong>
                  <p>{formatDateTime(warning.event.start_time)} → {formatDateTime(warning.event.end_time)}</p>
                  <p>{warning.team?.name || 'Unknown field'} · {warning.overlap_minutes} overlapping minutes</p>
                </div>
              ))}
            </div>
          ) : <p className="teams-note-card compact">No overlapping calendar items were detected.</p>}
        </article>
      </section>

      {request.rejection_reason ? (
        <div className="preview-link-box"><strong>Rejection reason:</strong> {request.rejection_reason}</div>
      ) : null}

      <Toast message={message} variant={messageType} />
    </DashboardLayout>
  );
}

