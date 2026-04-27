import React from 'react';
import { useEffect, useMemo, useState } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import Toast from '../components/Toast';
import { getTeams, getUsers, updateUserRole, updateUserStatus } from '../services/authApi';

function formatDateTime(value) {
  if (!value) return 'Never';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Never';
  return parsed.toLocaleString();
}

export default function RoleAssignmentPage() {
  const [users, setUsers] = useState([]);
  const [query, setQuery] = useState('');
  const [teams, setTeams] = useState([]);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('success');
  const [editingUser, setEditingUser] = useState(null);
  const [draft, setDraft] = useState({ role: 'player', teamId: '' });
  const [saving, setSaving] = useState(false);
  const [statusLoadingUserId, setStatusLoadingUserId] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadData() {
      const [usersResponse, teamsResponse] = await Promise.all([getUsers(query), getTeams()]);

      if (!active) return;

      if (usersResponse.success) {
        setUsers(usersResponse.data || []);
      } else {
        setMessageType('error');
        setMessage(usersResponse.message || 'Unable to load users.');
      }

      if (teamsResponse.success) {
        setTeams(teamsResponse.data || []);
      } else {
        setTeams([]);
      }
    }

    loadData().catch(() => {
      if (!active) return;
      setMessageType('error');
      setMessage('Unable to load data right now.');
    });

    return () => {
      active = false;
    };
  }, [query]);

  const filteredUsers = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    return users.filter((user) => {
      if (!showInactive && !user.isActive) {
        return false;
      }

      if (!normalized) {
        return true;
      }

      return [user.fullName, user.email, user.role, user.team, user.status]
        .join(' ')
        .toLowerCase()
        .includes(normalized);
    });
  }, [query, showInactive, users]);

  function findTeamIdByName(teamName) {
    const normalized = String(teamName || '').trim().toLowerCase();
    if (!normalized) return '';

    return teams.find((team) => team.name.trim().toLowerCase() === normalized)?.id || '';
  }

  function openEditor(user) {
    if (user.role === 'admin') {
      setMessageType('error');
      setMessage('The farm network admin is fixed. You can only reassign agronomist and farmer roles here.');
      return;
    }

    if (!user.isActive) {
      setMessageType('error');
      setMessage('Reactivate the user before editing role or field assignments.');
      return;
    }

    setEditingUser(user);
    setDraft({
      role: user.role || 'player',
      teamId: findTeamIdByName(user.team || ''),
    });
    setMessage('');
    setMessageType('success');
  }

  function closeEditor() {
    setEditingUser(null);
    setDraft({ role: 'player', teamId: '' });
  }

  async function saveChanges() {
    if (!editingUser) return;

    setSaving(true);
    setMessage('');

    const response = await updateUserRole(editingUser.id, {
      role: draft.role,
      teamId: draft.teamId || '',
    });

    setSaving(false);

    if (!response.success) {
      setMessageType('error');
      setMessage(response.message || 'Unable to save changes.');
      return;
    }

    setUsers((current) => current.map((user) => (user.id === editingUser.id ? response.data : user)));
    closeEditor();
    setMessageType('success');
    setMessage('User role and field assignment updated successfully.');
  }

  async function handleStatusToggle(user) {
    if (user.role === 'admin') {
      setMessageType('error');
      setMessage('The farm network admin is fixed and cannot be deactivated.');
      return;
    }

    const actionLabel = user.isActive ? 'deactivate' : 'reactivate';
    if (!window.confirm(`Are you sure you want to ${actionLabel} ${user.fullName}?`)) {
      return;
    }

    setStatusLoadingUserId(user.id);
    setMessage('');

    const response = await updateUserStatus(user.id, { isActive: !user.isActive });

    setStatusLoadingUserId('');

    if (!response.success) {
      setMessageType('error');
      setMessage(response.message || `Unable to ${actionLabel} user.`);
      return;
    }

    setUsers((current) => current.map((entry) => (entry.id === user.id ? response.data : entry)));

    if (editingUser?.id === user.id && !response.data.isActive) {
      closeEditor();
    }

    setMessageType('success');
    setMessage(`User ${response.data.isActive ? 'reactivated' : 'deactivated'} successfully.`);
  }

  const isDraftCoach = draft.role === 'coach';
  const teamSelectDisabled = teams.length === 0;
  const activeCount = users.filter((user) => user.isActive).length;
  const inactiveCount = users.filter((user) => !user.isActive).length;

  return (
    <DashboardLayout role="admin">
      <div className="page-head compact role-assignment-head">
        <div className="page-head-text">
          <h1>Role assignment</h1>
          <p>
            Manage only active users here. Accounts should be deactivated instead of deleted so history,
            requests, chats, and field records stay intact.
          </p>
        </div>
      </div>

      <div className="dashboard-card" style={{ marginBottom: '1rem' }}>
        <div className="section-row" style={{ gap: '0.75rem', flexWrap: 'wrap' }}>
          <div>
            <strong>Active users:</strong> {activeCount}
          </div>
          <div>
            <strong>Inactive users:</strong> {inactiveCount}
          </div>
          <label className="subtle-copy" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(event) => setShowInactive(event.target.checked)}
            />
            Show inactive users too
          </label>
        </div>
      </div>

      <div className="table-panel">
        <div className="search-bar" style={{ marginBottom: '1rem' }}>
          <span>🔍</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name, email, role, team, or status..."
          />
        </div>

        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Assigned Team</th>
              <th>Last Login</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((user) => {
              const isFixedAdmin = user.role === 'admin';
              const loadingStatus = statusLoadingUserId === user.id;

              return (
                <tr key={user.id}>
                  <td>{user.fullName}</td>
                  <td>{user.email}</td>
                  <td>
                    <span className="role-badge">{user.role}</span>
                  </td>
                  <td>
                    <span className="role-badge" style={{ opacity: user.isActive ? 1 : 0.7 }}>
                      {user.isActive ? 'active' : 'inactive'}
                    </span>
                  </td>
                  <td>{user.team || (isFixedAdmin ? 'All teams' : '-')}</td>
                  <td>{formatDateTime(user.lastLoginAt)}</td>
                  <td>
                    <div className="table-actions">
                      <button
                        className="mini-button team-action-button"
                        type="button"
                        onClick={() => openEditor(user)}
                        disabled={isFixedAdmin || !user.isActive}
                        title={
                          isFixedAdmin
                            ? 'The farm network admin role is fixed.'
                            : !user.isActive
                              ? 'Reactivate the user before editing.'
                              : 'Edit role'
                        }
                      >
                        {isFixedAdmin ? 'Fixed' : 'Edit'}
                      </button>
                      {!isFixedAdmin ? (
                        <button
                          className={user.isActive ? 'danger-button team-action-button compact-button' : 'mini-button team-action-button'}
                          type="button"
                          onClick={() => handleStatusToggle(user)}
                          disabled={loadingStatus}
                        >
                          {loadingStatus
                            ? user.isActive
                              ? 'Deactivating...'
                              : 'Reactivating...'
                            : user.isActive
                              ? 'Deactivate'
                              : 'Reactivate'}
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Toast message={message} variant={messageType} />

      {editingUser ? (
        <div className="modal-overlay" onClick={closeEditor}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <h2>{editingUser.fullName}</h2>

            <div className="modal-form-row">
              <label>Change role</label>
              <select
                value={draft.role}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    role: event.target.value,
                  }))
                }
                className="input select-input"
              >
                <option value="coach">Agronomist</option>
                <option value="player">Farmer</option>
              </select>
            </div>

            <div className="modal-form-row">
              <label>Team assignment</label>
              <p className="subtle-copy">
                Leave empty to keep no team. For coaches, selecting a field assigns that field to the coach. For
                players, selecting a field places the farmer on that roster.
              </p>
              <select
                value={draft.teamId}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    teamId: event.target.value,
                  }))
                }
                className="input select-input"
                disabled={teamSelectDisabled}
              >
                <option value="">{isDraftCoach ? 'No agronomist field selected' : 'No farmer field selected'}</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              className="primary-button full-width"
              onClick={saveChanges}
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save changes'}
            </button>
          </div>
        </div>
      ) : null}
    </DashboardLayout>
  );
}

