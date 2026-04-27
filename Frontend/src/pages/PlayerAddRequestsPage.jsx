import React from 'react';
import { useEffect, useState } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import Toast from '../components/Toast';
import { approvePlayerAddRequest, getPlayerAddRequests, rejectPlayerAddRequest } from '../services/authApi';

const STATUS_LABELS = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
};

const REQUEST_TYPE_LABELS = {
  add: 'Add Farmer',
  remove: 'Remove Farmer',
};

export default function PlayerAddRequestsPage() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState('');
  const [activeId, setActiveId] = useState('');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('success');

  async function loadRequests() {
    const response = await getPlayerAddRequests();
    if (!response.success) {
      setPageError(response.message || 'Unable to load farmer add requests.');
      setLoading(false);
      return;
    }
    setRequests(response.data);
    setLoading(false);
  }

  useEffect(() => {
    loadRequests().catch(() => {
      setPageError('Unable to load farmer add requests.');
      setLoading(false);
    });
  }, []);

  async function handleApprove(requestId) {
    setActiveId(requestId);
    const response = await approvePlayerAddRequest(requestId);
    setActiveId('');
    if (!response.success) {
      setMessageType('error');
      setMessage(response.message || 'Unable to approve request.');
      return;
    }
    setMessageType('success');
    const request = requests.find((r) => r.id === requestId);
    setMessage(request?.request_type === 'remove' ? 'Request approved. Farmer has been removed from the team.' : 'Request approved. Farmer has been added to the team.');
    setRequests((prev) => prev.map((r) => (r.id === requestId ? { ...r, status: 'approved' } : r)));
  }

  async function handleReject(requestId) {
    setActiveId(requestId);
    const response = await rejectPlayerAddRequest(requestId);
    setActiveId('');
    if (!response.success) {
      setMessageType('error');
      setMessage(response.message || 'Unable to reject request.');
      return;
    }
    setMessageType('success');
    setMessage('Request rejected.');
    setRequests((prev) => prev.map((r) => (r.id === requestId ? { ...r, status: 'rejected' } : r)));
  }

  return (
    <DashboardLayout role="admin">
      <div className="page-head">
        <div>
          <h1>Player Requests</h1>
          <p>Review and approve or reject agronomist requests to add or remove farmers from their teams.</p>
        </div>
      </div>

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
      ) : (
        <div className="table-panel">
          {requests.length ? (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Request</th>
                  <th>Farmer</th>
                  <th>Field</th>
                  <th>Requested by</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id}>
                    <td>{REQUEST_TYPE_LABELS[r.request_type || 'add'] || 'Farmer Request'}</td>
                    <td>{r.player_user?.full_name || r.player_user?.email || 'Unknown player'}</td>
                    <td>{r.team?.name || 'Unknown team'}</td>
                    <td>{r.coach?.full_name || r.coach?.email || 'Unknown coach'}</td>
                    <td>
                      <span className={`pill-${r.status === 'pending' ? 'warning' : r.status === 'approved' ? 'success' : 'muted'}`}>
                        {STATUS_LABELS[r.status] || r.status}
                      </span>
                    </td>
                    <td>{new Date(r.created_at).toLocaleDateString()}</td>
                    <td>
                      <div className="table-actions">
                        {r.status === 'pending' ? (
                          <>
                            <button
                              type="button"
                              className="mini-button"
                              onClick={() => handleApprove(r.id)}
                              disabled={activeId === r.id}
                            >
                              {activeId === r.id ? 'Working...' : 'Approve'}
                            </button>
                            <button
                              type="button"
                              className="secondary-button compact-button"
                              onClick={() => handleReject(r.id)}
                              disabled={activeId === r.id}
                            >
                              {activeId === r.id ? 'Working...' : 'Reject'}
                            </button>
                          </>
                        ) : (
                          <span className="pill-muted">Reviewed</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="teams-empty-state">
              <h2>No requests</h2>
              <p>There are no farmer requests at this time.</p>
            </div>
          )}
        </div>
      )}

      <Toast message={message} variant={messageType} />
    </DashboardLayout>
  );
}

