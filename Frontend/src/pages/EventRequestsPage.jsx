import React from 'react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '../layouts/DashboardLayout';
import Toast from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import {
  assignEventRequestAgronomist,
  approveEventRequest,
  getEventRequests,
  getUsers,
  rejectEventRequest,
} from '../services/authApi';

const STATUS_LABELS = {
  pending_admin_review: 'Admin Review',
  pending_coach_review: 'Agronomist Review',
  approved: 'Approved',
  rejected: 'Rejected',
};

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

function formatTimeRange(startTime, endTime) {
  if (!startTime || !endTime) return '—';
  return `${new Date(startTime).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })} - ${new Date(endTime).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })}`;
}

function StatusPill({ status }) {
  return (
    <span className={`request-status-pill request-status-${status}`}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}

function responseText(request, role) {
  if (request.status === 'approved') return 'Accepted and added to the calendar.';
  if (request.status === 'rejected') return request.rejection_reason || 'Rejected.';

  if (request.status === 'pending_admin_review') {
    return role === 'admin'
      ? 'Assign an agronomist to continue.'
      : 'Waiting for admin assignment.';
  }

  if (request.status === 'pending_coach_review') {
    return role === 'coach'
      ? 'Waiting for your decision.'
      : 'Waiting for agronomist review.';
  }

  return 'Waiting for review.';
}

export default function EventRequestsPage() {
  const { user } = useAuth();
  const role = user?.role || 'player';
  const isAgronomist = role === 'coach';
  const isFarmer = role === 'player';
  const isAdmin = role === 'admin';

  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState('');
  const [activeId, setActiveId] = useState('');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('success');
  const [agronomists, setAgronomists] = useState([]);
  const [assignSelections, setAssignSelections] = useState({});

  async function loadRequests() {
    const response = await getEventRequests();

    if (!response.success) {
      setPageError(response.message || 'Unable to load visit requests.');
      setLoading(false);
      return;
    }

    setRequests(response.data || []);
    setLoading(false);
  }

  useEffect(() => {
    loadRequests().catch(() => {
      setPageError('Unable to load visit requests.');
      setLoading(false);
    });
  }, []);

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
      })
      .catch(() => {
        if (active) setAgronomists([]);
      });

    return () => {
      active = false;
    };
  }, [isAdmin]);

  async function handleAssign(request) {
    const coachUserId = assignSelections[request.id] || agronomists[0]?.id || '';

    if (!coachUserId) {
      setMessageType('error');
      setMessage('Create or activate an agronomist before assigning this request.');
      return;
    }

    setActiveId(request.id);
    const response = await assignEventRequestAgronomist(request.id, { coachUserId });
    setActiveId('');

    if (!response.success) {
      setMessageType('error');
      setMessage(response.message || 'Unable to assign this agronomist.');
      return;
    }

    setMessageType('success');
    setMessage('Agronomist assigned. The request is now waiting for agronomist review.');
    setRequests((current) =>
      current.map((item) => (item.id === request.id ? response.data : item))
    );
  }

  async function handleApprove(request) {
    if ((request.overlap_warning_count || 0) > 0) {
      const confirmed = window.confirm(
        `This request overlaps with ${request.overlap_warning_count} existing calendar item${
          request.overlap_warning_count === 1 ? '' : 's'
        }. Accept anyway?`
      );

      if (!confirmed) return;
    }

    setActiveId(request.id);
    const response = await approveEventRequest(request.id);
    setActiveId('');

    if (!response.success) {
      setMessageType('error');
      setMessage(response.message || 'Unable to accept this request.');
      return;
    }

    setMessageType('success');
    setMessage('Request accepted and added to the calendar.');
    setRequests((current) =>
      current.map((item) => (item.id === request.id ? response.data : item))
    );
  }

  async function handleReject(request) {
    const reason =
      isAgronomist && request.status === 'pending_coach_review'
        ? window.prompt('Explain why you cannot take this request. The admin will be notified:', '') ?? ''
        : window.prompt('Optional rejection reason:', '') ?? '';

    setActiveId(request.id);
    const response = await rejectEventRequest(request.id, { reason });
    setActiveId('');

    if (!response.success) {
      setMessageType('error');
      setMessage(response.message || 'Unable to update this request.');
      return;
    }

    setMessageType('success');
    setMessage(
      response.data?.status === 'pending_admin_review'
        ? 'Admin notified. The request is back for agronomist reassignment.'
        : 'Request rejected.'
    );
    setRequests((current) =>
      current.map((item) => (item.id === request.id ? response.data : item))
    );
  }

  return (
    <DashboardLayout role={role}>
      <section className="page-head compact request-page-head">
        <div>
          <span className="hero-eyebrow">Agronomist request workflow</span>
          <h1>
            {isAgronomist
              ? 'Farmer Visit Requests'
              : isFarmer
                ? 'My Agronomist Requests'
                : 'Agronomist Requests'}
          </h1>
          <p>
            {isAgronomist
              ? 'Accept or reject farmer requests. Conflict warnings are shown before you add a visit to the calendar.'
              : isFarmer
                ? 'Track requests you sent for agronomist support.'
                : 'Review farmer requests that need admin assignment, especially when no agronomist is assigned yet.'}
          </p>
        </div>

        <div className="head-actions">
          <Link to="/events" className="secondary-button">
            View Calendar
          </Link>
          {isFarmer ? (
            <Link to="/events/create" className="primary-button">
              New Request
            </Link>
          ) : null}
        </div>
      </section>

      {pageError ? (
        <div className="table-panel">
          <div className="teams-empty-state">
            <h2>Unable to load requests</h2>
            <p>{pageError}</p>
          </div>
        </div>
      ) : loading ? (
        <div className="table-panel">
          <div className="teams-empty-state">
            <div className="spinner" />
            <p>Loading requests...</p>
          </div>
        </div>
      ) : requests.length ? (
        <section className="event-request-list-panel">
          {requests.map((request) => (
            <article key={request.id} className="event-request-card">
              <div className="event-request-card-main">
                <div className="event-request-title-block">
                  <span className="event-request-label">Title</span>
                  <h2>{request.current_title}</h2>
                  <StatusPill status={request.status} />
                </div>

                <div className="event-request-info-grid">
                  <div>
                    <span>Farmer</span>
                    <strong>{request.farmer?.full_name || '—'}</strong>
                  </div>

                  <div>
                    <span>Agronomist</span>
                    <strong>
                      {request.agronomist?.full_name ||
                        request.coach?.full_name ||
                        'Not assigned'}
                    </strong>
                  </div>

                  <div>
                    <span>Field</span>
                    <strong>{request.team?.name || 'Unknown field'}</strong>
                  </div>

                  <div>
                    <span>Date</span>
                    <strong>{formatDate(request.current_start_time)}</strong>
                  </div>

                  <div>
                    <span>Time</span>
                    <strong>
                      {formatTimeRange(request.current_start_time, request.current_end_time)}
                    </strong>
                  </div>

                  <div>
                    <span>Conflicts</span>
                    {request.overlap_warning_count > 0 ? (
                      <strong className="request-conflict-text">
                        {request.overlap_warning_count} overlap
                        {request.overlap_warning_count > 1 ? 's' : ''}
                      </strong>
                    ) : (
                      <strong>None</strong>
                    )}
                  </div>
                </div>

                <p className="event-request-response">{responseText(request, role)}</p>
              </div>

              <div className="event-request-card-actions">
                <Link
                  to={`/event-requests/${request.id}`}
                  className="secondary-button compact-button"
                >
                  View
                </Link>

                {isAgronomist && request.status === 'pending_coach_review' ? (
                  <>
                    <button
                      type="button"
                      className="mini-button"
                      onClick={() => handleApprove(request)}
                      disabled={activeId === request.id}
                    >
                      {activeId === request.id ? 'Working...' : 'Accept'}
                    </button>
                    <button
                      type="button"
                      className="secondary-button compact-button"
                      onClick={() => handleReject(request)}
                      disabled={activeId === request.id}
                    >
                      {activeId === request.id ? 'Working...' : 'Cannot Take'}
                    </button>
                  </>
                ) : null}

                {isAdmin && request.status === 'pending_admin_review' ? (
                  agronomists.length ? (
                    <div className="request-assign-actions">
                      <select
                        className="input request-assign-select"
                        value={assignSelections[request.id] || agronomists[0]?.id || ''}
                        onChange={(event) =>
                          setAssignSelections((current) => ({
                            ...current,
                            [request.id]: event.target.value,
                          }))
                        }
                      >
                        {agronomists.map((agronomist) => (
                          <option key={agronomist.id} value={agronomist.id}>
                            {agronomist.fullName}
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        className="mini-button"
                        onClick={() => handleAssign(request)}
                        disabled={activeId === request.id}
                      >
                        {activeId === request.id ? 'Assigning...' : 'Assign'}
                      </button>

                      <button
                        type="button"
                        className="secondary-button compact-button"
                        onClick={() => handleReject(request)}
                        disabled={activeId === request.id}
                      >
                        Reject
                      </button>
                    </div>
                  ) : (
                    <div className="request-no-agronomists">
                      <span>No available agronomists</span>
                      <Link to="/admin/create-user" className="secondary-button compact-button">
                        Create Agronomist
                      </Link>
                    </div>
                  )
                ) : null}

                {request.status === 'approved' && request.finalized_event_id ? (
                  <Link to="/events" className="mini-button">
                    Calendar
                  </Link>
                ) : null}
              </div>
            </article>
          ))}
        </section>
      ) : (
        <div className="table-panel">
          <div className="teams-empty-state">
            <h2>No requests yet</h2>
            <p>
              {isFarmer
                ? 'Send a request when you need agronomist support.'
                : 'No farmer requests are waiting right now.'}
            </p>
          </div>
        </div>
      )}

      <Toast message={message} variant={messageType} />
    </DashboardLayout>
  );
}
