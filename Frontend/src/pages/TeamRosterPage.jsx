import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import DashboardLayout from '../layouts/DashboardLayout';
import FormField from '../components/FormField';
import Toast from '../components/Toast';

import { useAuth } from '../context/AuthContext';
import {
  addPlayerToTeam,
  createPlayerAddRequest,
  getPlayerAddRequests,
  getPlayers,
  getTeam,
  getUsers,
  removePlayerFromTeam,
  updatePlayer,
  updateTeam,
} from '../services/authApi';

function TeamRosterLoading() {
  return (
    <div className="teams-empty-state">
      <div className="spinner" />
      <p>Loading field details...</p>
    </div>
  );
}

export default function TeamRosterPage() {
  const { id } = useParams();
  const { user } = useAuth();

  const isAdmin = user?.role === 'admin';

  const [team, setTeam] = useState(null);
  const [players, setPlayers] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingCoaches, setLoadingCoaches] = useState(false);
  const [pageError, setPageError] = useState('');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('success');

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isCoachModalOpen, setIsCoachModalOpen] = useState(false);

  const [editingRosterEntry, setEditingRosterEntry] = useState(null);
  const [editValues, setEditValues] = useState({
    jerseyNumber: '',
    preferredPosition: '',
  });
  const [editErrors, setEditErrors] = useState({});

  const [coachValue, setCoachValue] = useState('');
  const [coachErrors, setCoachErrors] = useState({});
  const [query, setQuery] = useState('');
  const [activePlayerId, setActivePlayerId] = useState('');
  const [savingCoach, setSavingCoach] = useState(false);
  const [playerRequests, setPlayerRequests] = useState([]);

  useEffect(() => {
    let active = true;

    async function loadData() {
      if (isAdmin) {
        setLoadingCoaches(true);
      }

      const [
        teamResponse,
        playersResponse,
        usersResponse,
        playerRequestsResponse,
      ] = await Promise.all([
        getTeam(id),
        getPlayers(),
        isAdmin ? getUsers() : Promise.resolve(null),
        user?.role === 'coach' ? getPlayerAddRequests() : Promise.resolve(null),
      ]);

      if (!active) return;

      if (!teamResponse.success) {
        setPageError(teamResponse.message || 'Unable to load this field.');
        setLoading(false);
        return;
      }

      if (!playersResponse.success) {
        setPageError(playersResponse.message || 'Unable to load farmer records.');
        setLoading(false);
        return;
      }

      setTeam(teamResponse.data);
      setPlayers(playersResponse.data);
      setCoachValue(teamResponse.data.coach_user_id || '');

      if (isAdmin) {
        if (usersResponse?.success) {
          setUsers(usersResponse.data || []);
        } else {
          setMessageType('error');
          setMessage(usersResponse?.message || 'Unable to load agronomists.');
        }

        setLoadingCoaches(false);
      } else if (user?.role === 'coach') {
        if (playerRequestsResponse?.success) {
          setPlayerRequests(playerRequestsResponse.data || []);
        } else {
          setPlayerRequests([]);
        }
      }

      setLoading(false);
    }

    loadData().catch(() => {
      if (!active) return;

      setLoadingCoaches(false);
      setPageError('Unable to load this field right now.');
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [id, isAdmin, user?.role]);

  async function refreshTeamData({
    includeUsers = false,
    includePlayerRequests = false,
  } = {}) {
    const [
      teamResponse,
      playersResponse,
      usersResponse,
      playerRequestsResponse,
    ] = await Promise.all([
      getTeam(id),
      getPlayers(),
      includeUsers && isAdmin ? getUsers() : Promise.resolve(null),
      includePlayerRequests && user?.role === 'coach'
        ? getPlayerAddRequests()
        : Promise.resolve(null),
    ]);

    if (!teamResponse.success) {
      throw new Error(teamResponse.message || 'Unable to refresh this field.');
    }

    if (!playersResponse.success) {
      throw new Error(playersResponse.message || 'Unable to refresh farmer records.');
    }

    setTeam(teamResponse.data);
    setPlayers(playersResponse.data);

    if (includeUsers && isAdmin) {
      if (!usersResponse?.success) {
        throw new Error(usersResponse?.message || 'Unable to refresh agronomists.');
      }

      setUsers(usersResponse.data || []);
    }

    if (includePlayerRequests && user?.role === 'coach') {
      if (!playerRequestsResponse?.success) {
        throw new Error(
          playerRequestsResponse?.message || 'Unable to refresh farmer requests.'
        );
      }

      setPlayerRequests(playerRequestsResponse.data || []);
    }
  }

  const roster = team?.roster ?? [];
  const coachName = team?.coach?.full_name || 'No agronomist assigned';

  const canManageCoach = isAdmin;
  const canManageRoster =
    isAdmin || (user?.role === 'coach' && team?.coach_user_id === user.id);
  const canRemovePlayers = isAdmin || canManageRoster;

  const availableCoaches = useMemo(() => {
    return users.filter((entry) => entry.role === 'coach');
  }, [users]);

  const currentCoachFallback = useMemo(() => {
    if (!team?.coach_user_id) {
      return null;
    }

    return availableCoaches.some((entry) => entry.id === team.coach_user_id)
      ? null
      : {
          id: team.coach_user_id,
          fullName: team.coach?.full_name || 'Current agronomist',
        };
  }, [availableCoaches, team?.coach?.full_name, team?.coach_user_id]);

  const availablePlayers = useMemo(() => {
    return players.filter(
      (player) => player.user?.role === 'player' && !player.team_membership
    );
  }, [players]);

  const filteredAvailablePlayers = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    if (!normalized) return availablePlayers;

    return availablePlayers.filter((player) =>
      [
        player.user?.full_name,
        player.user?.email,
        player.jersey_number,
        player.preferred_position,
      ]
        .join(' ')
        .toLowerCase()
        .includes(normalized)
    );
  }, [availablePlayers, query]);

  async function handleAddPlayer(playerId) {
    setActivePlayerId(playerId);

    if (isAdmin) {
      const response = await addPlayerToTeam(id, { playerId });

      if (!response.success) {
        setActivePlayerId('');
        setMessageType('error');
        setMessage(response.message || 'Unable to add farmer to this field.');
        return;
      }

      try {
        await refreshTeamData({ includePlayerRequests: !isAdmin });
        setMessageType('success');
        setMessage('Farmer assigned to the field.');
        setIsAddModalOpen(false);
        setQuery('');
      } catch (error) {
        setMessageType('error');
        setMessage(error.message);
      } finally {
        setActivePlayerId('');
      }

      return;
    }

    const response = await createPlayerAddRequest({ playerId, teamId: id });
    setActivePlayerId('');

    if (!response.success) {
      setMessageType('error');
      setMessage(response.message || 'Unable to submit farmer request.');
      return;
    }

    setMessageType('success');
    setMessage('Request submitted. An admin will review it shortly.');
    setIsAddModalOpen(false);
    setQuery('');
  }

  async function handleRemovePlayer(playerId) {
    if (!canRemovePlayers) {
      setMessageType('error');
      setMessage('You do not have permission to remove this farmer.');
      return;
    }

    setActivePlayerId(playerId);

    if (isAdmin) {
      const response = await removePlayerFromTeam(id, playerId);

      if (!response.success) {
        setActivePlayerId('');
        setMessageType('error');
        setMessage(response.message || 'Unable to remove farmer from this field.');
        return;
      }

      try {
        await refreshTeamData({ includePlayerRequests: !isAdmin });
        setMessageType('success');
        setMessage('Farmer removed from the field.');
      } catch (error) {
        setMessageType('error');
        setMessage(error.message);
      } finally {
        setActivePlayerId('');
      }

      return;
    }

    const response = await createPlayerAddRequest({
      playerId,
      teamId: id,
      requestType: 'remove',
    });

    setActivePlayerId('');

    if (!response.success) {
      setMessageType('error');
      setMessage(response.message || 'Unable to submit remove-farmer request.');
      return;
    }

    try {
      await refreshTeamData({ includePlayerRequests: true });
      setMessageType('success');
      setMessage('Remove-farmer request submitted. An admin will review it shortly.');
    } catch (error) {
      setMessageType('error');
      setMessage(error.message);
    }
  }

  function openCoachModal() {
    setCoachValue(team?.coach_user_id || '');
    setCoachErrors({});
    setIsCoachModalOpen(true);
  }

  function closeCoachModal() {
    setIsCoachModalOpen(false);
    setCoachValue(team?.coach_user_id || '');
    setCoachErrors({});
  }

  async function handleSaveCoachAssignment() {
    const selectedCoachId = coachValue || null;
    const currentCoachId = team?.coach_user_id || null;

    if (selectedCoachId === currentCoachId) {
      closeCoachModal();
      return;
    }

    setSavingCoach(true);

    const response = await updateTeam(id, {
      coachUserId: selectedCoachId,
    });

    if (!response.success) {
      setSavingCoach(false);
      setCoachErrors(response.errors ?? {});
      setMessageType('error');
      setMessage(response.message || 'Unable to update the assigned agronomist.');
      return;
    }

    try {
      await refreshTeamData({ includeUsers: true });
      setMessageType('success');
      setMessage(
        selectedCoachId
          ? 'Agronomist assignment updated.'
          : 'Agronomist removed from the field.'
      );
      closeCoachModal();
    } catch (error) {
      setMessageType('error');
      setMessage(error.message);
    } finally {
      setSavingCoach(false);
    }
  }

  function openEditModal(entry) {
    setEditingRosterEntry(entry);
    setEditValues({
      jerseyNumber: entry.player.jersey_number ?? '',
      preferredPosition: entry.player.preferred_position || '',
    });
    setEditErrors({});
  }

  function closeEditModal() {
    setEditingRosterEntry(null);
    setEditValues({ jerseyNumber: '', preferredPosition: '' });
    setEditErrors({});
  }

  function handleEditChange(event) {
    const { name, value } = event.target;

    setEditValues((current) => ({
      ...current,
      [name]: value,
    }));

    setEditErrors((current) => ({
      ...current,
      [name]: '',
    }));
  }

  async function handleSavePlayerDetails() {
    if (!editingRosterEntry) return;

    const nextErrors = {};
    const payload = {};
    const trimmedPosition = editValues.preferredPosition.trim();
    const jerseyValue = String(editValues.jerseyNumber).trim();

    if (jerseyValue) {
      const parsedJerseyNumber = Number(jerseyValue);

      if (
        !Number.isInteger(parsedJerseyNumber) ||
        parsedJerseyNumber < 0 ||
        parsedJerseyNumber > 999
      ) {
        nextErrors.jerseyNumber = 'Use a whole number between 0 and 999.';
      } else {
        const duplicateJersey = roster.find(
          (entry) =>
            entry.player_id !== editingRosterEntry.player_id &&
            entry.player?.jersey_number === parsedJerseyNumber
        );

        if (duplicateJersey) {
          nextErrors.jerseyNumber =
            'This farm ID is already assigned to another farmer in this field.';
        }

        payload.jerseyNumber = parsedJerseyNumber;
      }
    }

    payload.preferredPosition = trimmedPosition;

    if (Object.keys(nextErrors).length) {
      setEditErrors(nextErrors);
      return;
    }

    setActivePlayerId(editingRosterEntry.player_id);

    const response = await updatePlayer(editingRosterEntry.player_id, payload);

    if (!response.success) {
      setActivePlayerId('');
      setEditErrors(response.errors ?? {});
      setMessageType('error');
      setMessage(response.message || 'Unable to update farmer details.');
      return;
    }

    try {
      await refreshTeamData();
      setMessageType('success');
      setMessage('Farmer details updated.');
      closeEditModal();
    } catch (error) {
      setMessageType('error');
      setMessage(error.message);
    } finally {
      setActivePlayerId('');
    }
  }

  return (
    <DashboardLayout role={user?.role || 'coach'}>
      <div className="page-head">
        <div>
          <Link className="muted-page-link" to="/teams">
            Back to fields
          </Link>
          <h1>{loading ? 'Field Farmer List' : `${team.name} Farmer List`}</h1>
          <p>
            {canManageRoster
              ? 'Manage assigned farmers and agronomist responsibility for this field.'
              : 'View the farmer list and farmer details for this field.'}
          </p>
        </div>
      </div>

      {pageError ? (
        <div className="table-panel">
          <div className="teams-empty-state">
            <h2>Unable to load field</h2>
            <p>{pageError}</p>
          </div>
        </div>
      ) : loading ? (
        <div className="table-panel">
          <TeamRosterLoading />
        </div>
      ) : (
        <div className="field-details-page">
          <div className="team-summary-grid field-details-top">
            <div className="dashboard-card team-summary-card">
              <p className="eyebrow">Assigned Agronomist</p>
              <h2>{coachName}</h2>
              <p className="subtle-copy">
                {team.coach
                  ? `${team.coach.email} - Agronomist`
                  : 'This field has not been assigned an agronomist yet.'}
              </p>

              {canManageCoach ? (
                <button
                  type="button"
                  className="secondary-button compact-button"
                  onClick={openCoachModal}
                  disabled={loadingCoaches}
                >
                  {team.coach ? 'Change Agronomist' : 'Assign Agronomist'}
                </button>
              ) : null}
            </div>

            <div className="dashboard-card team-summary-card">
              <p className="eyebrow">Field details</p>
              <h2>{team.name}</h2>

              <div className="detail-list">
                <div>
                  <span className="detail-label">Farmers</span>
                  <span className="detail-value">{team.players_count}</span>
                </div>
                <div>
                  <span className="detail-label">Created</span>
                  <span className="detail-value">
                    {new Date(team.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="table-panel farmer-list-card">
            <div className="section-row farmer-list-header">
              <h2>Farmer List</h2>

              {canManageRoster ? (
                <button
                  className="primary-button small"
                  type="button"
                  onClick={() => setIsAddModalOpen(true)}
                >
                  {isAdmin ? 'Add Farmer' : 'Request Farmer'}
                </button>
              ) : null}
            </div>

            {roster.length ? (
              <table className="data-table farmer-list-table">
                <thead>
                  <tr>
                    <th>Farmer Name</th>
                    <th>Email</th>
                    <th>Farm ID</th>
                    <th>Crop Focus</th>
                    <th>Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {roster.map((entry) => (
                    <tr key={entry.player_id}>
                      <td>{entry.user?.full_name || 'Farmer record'}</td>
                      <td>{entry.user?.email || 'Email unavailable'}</td>
                      <td>{entry.player.jersey_number ?? 'Not set'}</td>
                      <td>{entry.player.preferred_position || 'Not set'}</td>
                      <td className="farmer-actions-cell">
                        <div className="table-actions farmer-actions">
                          {canManageRoster ? (
                            <>
                              <button
                                type="button"
                                className="mini-button outline compact-action-button"
                                onClick={() => openEditModal(entry)}
                                disabled={activePlayerId === entry.player_id}
                              >
                                Edit
                              </button>

                              {isAdmin ? (
                                <button
                                  type="button"
                                  className="danger-button compact-action-button"
                                  onClick={() => handleRemovePlayer(entry.player_id)}
                                  disabled={activePlayerId === entry.player_id}
                                >
                                  {activePlayerId === entry.player_id
                                    ? 'Working...'
                                    : 'Remove'}
                                </button>
                              ) : null}
                            </>
                          ) : (
                            <span className="pill-muted">View only</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="teams-empty-state">
                <h2>No farmers assigned</h2>
                <p>
                  {canManageRoster
                    ? 'Use the add farmer action to start building this field farmer list.'
                    : 'No farmers are currently assigned to this field.'}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {canManageRoster && isAddModalOpen && !loading && !pageError ? (
        <div className="modal-overlay" onClick={() => setIsAddModalOpen(false)}>
          <div
            className="modal-card large-modal-card"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="section-row">
              <h2>
                {isAdmin ? 'Add farmer to' : 'Request farmer for'} {team.name}
              </h2>
              <button
                className="link-button"
                type="button"
                onClick={() => setIsAddModalOpen(false)}
              >
                Close
              </button>
            </div>

            <div className="search-bar">
              <span>🔍</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search available farmers..."
              />
            </div>

            <div className="roster-picker-list">
              {filteredAvailablePlayers.length ? (
                filteredAvailablePlayers.map((player) => (
                  <div key={player.id} className="roster-picker-row">
                    <div>
                      <strong>{player.user?.full_name || 'Farmer record'}</strong>
                      <p>
                        {player.user?.email || 'Email unavailable'} - Farm ID{' '}
                        {player.jersey_number}
                      </p>
                    </div>

                    <button
                      type="button"
                      className="mini-button"
                      onClick={() => handleAddPlayer(player.id)}
                      disabled={activePlayerId === player.id}
                    >
                      {activePlayerId === player.id
                        ? isAdmin
                          ? 'Adding...'
                          : 'Requesting...'
                        : isAdmin
                          ? 'Add'
                          : 'Request'}
                    </button>
                  </div>
                ))
              ) : (
                <div className="teams-empty-state compact-empty-state">
                  <h2>No available farmers</h2>
                  <p>
                    All farmer records are currently assigned to a field or no farmer
                    records exist yet.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {canManageRoster && editingRosterEntry ? (
        <div className="modal-overlay" onClick={closeEditModal}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <h2>Edit farmer details</h2>

            <div className="modal-form-row">
              <label htmlFor="jerseyNumber">Farm ID</label>
              <div className="form-field compact-form-field">
                <input
                  id="jerseyNumber"
                  name="jerseyNumber"
                  type="number"
                  min="0"
                  max="999"
                  value={editValues.jerseyNumber}
                  onChange={handleEditChange}
                  className={editErrors.jerseyNumber ? 'input error' : 'input'}
                  placeholder="Set farm ID"
                />
                {editErrors.jerseyNumber ? (
                  <span className="field-error">{editErrors.jerseyNumber}</span>
                ) : null}
              </div>
            </div>

            <div className="modal-form-row">
              <label htmlFor="preferredPosition">Crop focus</label>
              <div className="form-field compact-form-field">
                <input
                  id="preferredPosition"
                  name="preferredPosition"
                  type="text"
                  value={editValues.preferredPosition}
                  onChange={handleEditChange}
                  className={editErrors.preferredPosition ? 'input error' : 'input'}
                  placeholder="Set crop focus"
                />
                {editErrors.preferredPosition ? (
                  <span className="field-error">{editErrors.preferredPosition}</span>
                ) : null}
              </div>
            </div>

            <div className="table-actions modal-actions">
              <button
                type="button"
                className="secondary-button compact-button"
                onClick={closeEditModal}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary-button compact-button"
                onClick={handleSavePlayerDetails}
                disabled={activePlayerId === editingRosterEntry.player_id}
              >
                {activePlayerId === editingRosterEntry.player_id ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {canManageCoach && isCoachModalOpen ? (
        <div className="modal-overlay" onClick={closeCoachModal}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <h2>{team?.coach ? 'Change Agronomist' : 'Assign Agronomist'}</h2>

            <FormField
              label="Agronomist"
              name="coachUserId"
              error={coachErrors.coachUserId}
              children={
                <select
                  id="coachUserId"
                  name="coachUserId"
                  value={coachValue}
                  onChange={(event) => {
                    setCoachValue(event.target.value);
                    setCoachErrors((current) => ({
                      ...current,
                      coachUserId: '',
                    }));
                  }}
                  className={coachErrors.coachUserId ? 'input error' : 'input'}
                  disabled={loadingCoaches || savingCoach}
                >
                  <option value="">
                    {loadingCoaches
                      ? 'Loading agronomists...'
                      : 'No agronomist assigned'}
                  </option>

                  {currentCoachFallback ? (
                    <option value={currentCoachFallback.id}>
                      {currentCoachFallback.fullName}
                    </option>
                  ) : null}

                  {availableCoaches.map((coach) => (
                    <option key={coach.id} value={coach.id}>
                      {coach.fullName}
                    </option>
                  ))}
                </select>
              }
            />

            <div className="table-actions modal-actions">
              <button
                type="button"
                className="secondary-button compact-button"
                onClick={closeCoachModal}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary-button compact-button"
                onClick={handleSaveCoachAssignment}
                disabled={loadingCoaches || savingCoach}
              >
                {savingCoach ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <Toast message={message} variant={messageType} />
    </DashboardLayout>
  );
}