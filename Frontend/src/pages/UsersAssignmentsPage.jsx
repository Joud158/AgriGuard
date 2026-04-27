import React from 'react';
import { useEffect, useMemo, useState } from 'react';

import DashboardLayout from '../layouts/DashboardLayout';
import Toast from '../components/Toast';

import {
  getTeams,
  getUsers,
  updateTeam,
  updateUserRole,
  updateUserStatus,
} from '../services/authApi';

function getUserName(user) {
  return user.fullName || user.full_name || 'Unnamed user';
}

function getUserEmail(user) {
  return user.email || '—';
}

function isUserActive(user) {
  return user.isActive !== false && user.is_active !== false && user.status !== 'inactive';
}

function getTeamCoachId(team) {
  return team.coach_user_id || team.coachUserId || '';
}

function getFarmerTeamId(user, teams) {
  const assignedName = user.team || user.assigned_team || '';
  if (!assignedName) return '';

  const match = teams.find((team) => team.name === assignedName);
  return match?.id || '';
}

function StatusBadge({ active }) {
  return (
    <span className={active ? 'status-chip active' : 'status-chip inactive'}>
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}

export default function UsersAssignmentsPage() {
  const [users, setUsers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [farmerSelections, setFarmerSelections] = useState({});
  const [agronomistSelections, setAgronomistSelections] = useState({});
  const [loading, setLoading] = useState(true);
  const [workingKey, setWorkingKey] = useState('');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('success');

  async function loadData() {
    setLoading(true);
    setMessage('');

    const [usersResponse, teamsResponse] = await Promise.all([
      getUsers(),
      getTeams(),
    ]);

    if (!usersResponse.success) {
      setMessageType('error');
      setMessage(usersResponse.message || 'Unable to load users.');
      setUsers([]);
      setTeams([]);
      setLoading(false);
      return;
    }

    if (!teamsResponse.success) {
      setMessageType('error');
      setMessage(teamsResponse.message || 'Unable to load fields.');
      setUsers(usersResponse.data || []);
      setTeams([]);
      setLoading(false);
      return;
    }

    const loadedUsers = usersResponse.data || [];
    const loadedTeams = teamsResponse.data || [];

    setUsers(loadedUsers);
    setTeams(loadedTeams);

    setFarmerSelections(
      loadedUsers
        .filter((user) => user.role === 'player')
        .reduce((lookup, user) => {
          lookup[user.id] = getFarmerTeamId(user, loadedTeams);
          return lookup;
        }, {})
    );

    setAgronomistSelections(
      loadedUsers
        .filter((user) => user.role === 'coach')
        .reduce((lookup, user) => {
          lookup[user.id] = loadedTeams
            .filter((team) => getTeamCoachId(team) === user.id)
            .map((team) => team.id);
          return lookup;
        }, {})
    );

    setLoading(false);
  }

  useEffect(() => {
    loadData().catch(() => {
      setMessageType('error');
      setMessage('Unable to load user assignment data right now.');
      setLoading(false);
    });
  }, []);

  const farmers = useMemo(
    () => users.filter((user) => user.role === 'player'),
    [users]
  );

  const agronomists = useMemo(
    () => users.filter((user) => user.role === 'coach'),
    [users]
  );

  function setFarmerField(userId, teamId) {
    setFarmerSelections((current) => ({
      ...current,
      [userId]: teamId,
    }));
  }

  function toggleAgronomistField(userId, teamId) {
    setAgronomistSelections((current) => {
      const currentIds = current[userId] || [];
      const nextIds = currentIds.includes(teamId)
        ? currentIds.filter((id) => id !== teamId)
        : [...currentIds, teamId];

      return {
        ...current,
        [userId]: nextIds,
      };
    });
  }

  async function handleSaveFarmer(user) {
    setWorkingKey(`farmer-${user.id}`);
    setMessage('');

    const response = await updateUserRole(user.id, {
      role: 'player',
      teamId: farmerSelections[user.id] || '',
    });

    setWorkingKey('');

    if (!response.success) {
      setMessageType('error');
      setMessage(response.message || 'Unable to update farmer field assignment.');
      return;
    }

    setMessageType('success');
    setMessage('Farmer field assignment updated.');
    await loadData();
  }

  async function handleSaveAgronomist(user) {
    setWorkingKey(`agronomist-${user.id}`);
    setMessage('');

    const selectedTeamIds = new Set(agronomistSelections[user.id] || []);
    const updates = teams
      .filter((team) => {
        const currentCoachId = getTeamCoachId(team);
        const shouldAssignToUser = selectedTeamIds.has(team.id);

        return (
          (shouldAssignToUser && currentCoachId !== user.id) ||
          (!shouldAssignToUser && currentCoachId === user.id)
        );
      })
      .map((team) =>
        updateTeam(team.id, {
          coachUserId: selectedTeamIds.has(team.id) ? user.id : '',
        })
      );

    const responses = await Promise.all(updates);
    const failed = responses.find((response) => !response.success);

    setWorkingKey('');

    if (failed) {
      setMessageType('error');
      setMessage(failed.message || 'Unable to update agronomist field assignments.');
      return;
    }

    setMessageType('success');
    setMessage('Agronomist field assignments updated.');
    await loadData();
  }

  async function handleToggleStatus(user) {
    const nextActive = !isUserActive(user);
    const label = getUserName(user);

    if (!nextActive) {
      const confirmed = window.confirm(
        `Deactivate ${label}? They will no longer be able to use the platform.`
      );

      if (!confirmed) return;
    }

    setWorkingKey(`status-${user.id}`);
    setMessage('');

    const response = await updateUserStatus(user.id, {
      isActive: nextActive,
    });

    setWorkingKey('');

    if (!response.success) {
      setMessageType('error');
      setMessage(response.message || 'Unable to update user status.');
      return;
    }

    setMessageType('success');
    setMessage(nextActive ? 'User reactivated.' : 'User deactivated.');
    await loadData();
  }

  return (
    <DashboardLayout role="admin">
      <section className="page-head compact assignments-head">
        <div>
          <span className="hero-eyebrow">Admin user control</span>
          <h1>Users & Assignments</h1>
          <p>
            Change farmer field assignments, manage agronomist coverage, and
            activate or deactivate platform users.
          </p>
        </div>
      </section>

      {loading ? (
        <p className="loading-text">Loading users and fields...</p>
      ) : (
        <div className="assignment-page-grid">
          <section className="dashboard-card assignment-section">
            <div className="section-row">
              <div>
                <h2>Farmers</h2>
                <p className="muted-copy">
                  Each farmer can be assigned to one field only, or left unassigned.
                </p>
              </div>
            </div>

            {farmers.length ? (
              <div className="assignment-card-list">
                {farmers.map((farmer) => {
                  const active = isUserActive(farmer);
                  const working =
                    workingKey === `farmer-${farmer.id}` ||
                    workingKey === `status-${farmer.id}`;

                  return (
                    <article key={farmer.id} className="assignment-user-card">
                      <div className="assignment-user-main">
                        <div>
                          <h3>{getUserName(farmer)}</h3>
                          <p>{getUserEmail(farmer)}</p>
                        </div>
                        <StatusBadge active={active} />
                      </div>

                      <label className="assignment-control">
                        <span>Assigned field</span>
                        <select
                          className="input"
                          value={farmerSelections[farmer.id] || ''}
                          onChange={(event) => setFarmerField(farmer.id, event.target.value)}
                          disabled={working}
                        >
                          <option value="">Not assigned</option>
                          {teams.map((team) => (
                            <option key={team.id} value={team.id}>
                              {team.name}
                            </option>
                          ))}
                        </select>
                      </label>

                      <div className="assignment-actions">
                        <button
                          type="button"
                          className="primary-button"
                          onClick={() => handleSaveFarmer(farmer)}
                          disabled={working}
                        >
                          {workingKey === `farmer-${farmer.id}` ? 'Saving...' : 'Save Field'}
                        </button>

                        <button
                          type="button"
                          className={active ? 'secondary-button' : 'mini-button'}
                          onClick={() => handleToggleStatus(farmer)}
                          disabled={working}
                        >
                          {workingKey === `status-${farmer.id}`
                            ? 'Updating...'
                            : active
                              ? 'Deactivate'
                              : 'Reactivate'}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="teams-note-card compact">
                <strong>No farmers yet</strong>
                <p>Create farmer accounts first, then assign them here.</p>
              </div>
            )}
          </section>

          <section className="dashboard-card assignment-section">
            <div className="section-row">
              <div>
                <h2>Agronomists</h2>
                <p className="muted-copy">
                  Agronomists can cover multiple fields. A field can have one
                  assigned agronomist at a time.
                </p>
              </div>
            </div>

            {agronomists.length ? (
              <div className="assignment-card-list">
                {agronomists.map((agronomist) => {
                  const active = isUserActive(agronomist);
                  const selectedIds = agronomistSelections[agronomist.id] || [];
                  const working =
                    workingKey === `agronomist-${agronomist.id}` ||
                    workingKey === `status-${agronomist.id}`;

                  return (
                    <article key={agronomist.id} className="assignment-user-card agronomist-card">
                      <div className="assignment-user-main">
                        <div>
                          <h3>{getUserName(agronomist)}</h3>
                          <p>{getUserEmail(agronomist)}</p>
                        </div>
                        <StatusBadge active={active} />
                      </div>

                      <div className="assignment-control">
                        <span>Covered fields</span>
                        <div className="assignment-field-checklist">
                          {teams.map((team) => {
                            const currentCoachId = getTeamCoachId(team);
                            const currentCoach = agronomists.find((item) => item.id === currentCoachId);
                            const assignedToOther =
                              currentCoachId && currentCoachId !== agronomist.id;
                            const checked = selectedIds.includes(team.id);

                            return (
                              <label
                                key={team.id}
                                className={
                                  checked
                                    ? 'assignment-check-row selected'
                                    : 'assignment-check-row'
                                }
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleAgronomistField(agronomist.id, team.id)}
                                  disabled={working}
                                />
                                <span>
                                  {team.name}
                                  {assignedToOther ? (
                                    <em> currently assigned to {getUserName(currentCoach || {})}</em>
                                  ) : null}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      </div>

                      <div className="assignment-actions">
                        <button
                          type="button"
                          className="primary-button"
                          onClick={() => handleSaveAgronomist(agronomist)}
                          disabled={working}
                        >
                          {workingKey === `agronomist-${agronomist.id}`
                            ? 'Saving...'
                            : 'Save Fields'}
                        </button>

                        <button
                          type="button"
                          className={active ? 'secondary-button' : 'mini-button'}
                          onClick={() => handleToggleStatus(agronomist)}
                          disabled={working}
                        >
                          {workingKey === `status-${agronomist.id}`
                            ? 'Updating...'
                            : active
                              ? 'Deactivate'
                              : 'Reactivate'}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="teams-note-card compact">
                <strong>No agronomists yet</strong>
                <p>Create agronomist accounts first, then assign fields here.</p>
              </div>
            )}
          </section>
        </div>
      )}

      <Toast message={message} variant={messageType} />
    </DashboardLayout>
  );
}
