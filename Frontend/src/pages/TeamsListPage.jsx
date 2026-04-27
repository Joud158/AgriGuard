import React, { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

import DashboardLayout from '../layouts/DashboardLayout';
import Toast from '../components/Toast';

import { useAuth } from '../context/AuthContext';
import { deleteTeam, getTeams } from '../services/authApi';

function hasBoundary(team) {
  const bbox =
    team.fieldBbox ||
    team.field_bbox ||
    team.bbox ||
    team.satelliteBbox ||
    team.satellite_bbox ||
    team.boundaryBbox ||
    team.boundary_bbox;

  const geometry =
    team.fieldGeometry ||
    team.field_geometry ||
    team.geometry ||
    team.satelliteGeometry ||
    team.satellite_geometry ||
    team.boundaryGeometry ||
    team.boundary_geometry;

  return Boolean(
    team.hasBoundary ||
      team.hasFieldBoundary ||
      team.has_field_boundary ||
      (Array.isArray(bbox) &&
        bbox.length === 4 &&
        bbox.every((value) => Number.isFinite(Number(value)))) ||
      (geometry?.type === 'Polygon' &&
        Array.isArray(geometry.coordinates?.[0]) &&
        geometry.coordinates[0].length >= 4)
  );
}

export default function TeamsListPage() {
  const { user } = useAuth();
  const location = useLocation();

  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deletingTeamId, setDeletingTeamId] = useState('');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('success');

  const isAdmin = user?.role === 'admin';
  const visibleTeams = teams;

  const loadTeams = useCallback(async () => {
    setLoading(true);

    const response = await getTeams();

    if (!response.success) {
      setMessageType('error');
      setMessage(response.message || 'Unable to load fields.');
      setTeams([]);
      setLoading(false);
      return;
    }

    setTeams(Array.isArray(response.data) ? response.data : []);
    setLoading(false);
  }, []);

  useEffect(() => {
    let active = true;

    loadTeams().catch(() => {
      if (!active) {
        return;
      }

      setMessageType('error');
      setMessage('Unable to load fields right now.');
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [loadTeams, location.key]);

  async function handleDeleteTeam(team) {
    if (
      !window.confirm(
        `Delete ${team.name}? This will also remove its farmer assignments, events, announcements, and saved satellite boundary.`
      )
    ) {
      return;
    }

    setDeletingTeamId(team.id);

    const response = await deleteTeam(team.id);

    setDeletingTeamId('');

    if (!response.success) {
      setMessageType('error');
      setMessage(response.message || 'Unable to delete this field.');
      return;
    }

    setTeams((current) => current.filter((entry) => entry.id !== team.id));
    setMessageType('success');
    setMessage(`${team.name} was deleted.`);
  }

  return (
    <DashboardLayout role={user?.role || 'coach'}>
      <div className="page-head">
        <div>
          <h1>Farmers & Fields</h1>
          <p>
            {isAdmin
              ? 'Create mapped fields, draw satellite boundaries, and assign farmers to the fields they monitor.'
              : 'Review the mapped fields available to you.'}
          </p>
        </div>

        {isAdmin ? (
          <div className="head-actions">
            <button type="button" className="secondary-button" onClick={loadTeams}>
              Refresh
            </button>
            <Link className="primary-button" to="/teams/create">
              Create Field
            </Link>
          </div>
        ) : null}
      </div>

      <div className="table-panel farmers-fields-panel">
        {loading ? (
          <div className="teams-empty-state">
            <div className="spinner" />
            <p>Loading fields...</p>
          </div>
        ) : visibleTeams.length ? (
          <table className="data-table farmers-fields-table">
            <thead>
              <tr>
                <th>Field Name</th>
                <th>Crop</th>
                <th>Farmers Count</th>
                <th>Satellite Boundary</th>
                <th>{isAdmin ? 'Actions' : 'Manage'}</th>
              </tr>
            </thead>

            <tbody>
              {visibleTeams.map((team) => {
                const mapped = hasBoundary(team);

                return (
                  <tr key={team.id}>
                    <td>{team.name}</td>
                    <td>{team.crop || 'Not specified'}</td>
                    <td>
                      <span className="pill-muted">
                        {team.players_count ?? team.playersCount ?? 0}
                      </span>
                    </td>
                    <td>
                      <span className={mapped ? 'status-chip' : 'pill-muted'}>
                        {mapped ? 'Mapped' : 'Missing'}
                      </span>
                    </td>
                    <td>
                      <div className="table-actions field-actions">
                        <Link
                          className="mini-button team-action-button"
                          to={`/teams/${team.id}`}
                        >
                          {isAdmin ? 'View' : 'Manage'}
                        </Link>

                        {isAdmin ? (
                          <>
                            <Link
                              className="mini-button team-action-button"
                              to={`/teams/create?fieldId=${encodeURIComponent(team.id)}`}
                            >
                              {mapped ? 'Edit Map' : 'Set Boundary'}
                            </Link>

                            <button
                              type="button"
                              className="danger-button team-action-button compact-button"
                              onClick={() => handleDeleteTeam(team)}
                              disabled={deletingTeamId === team.id}
                            >
                              {deletingTeamId === team.id ? 'Deleting...' : 'Delete'}
                            </button>
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="teams-empty-state">
            <h2>No fields yet</h2>
            <p>
              {isAdmin
                ? 'Create the first field and draw its boundary so Sentinel-2 can monitor it.'
                : 'No mapped fields are currently assigned to you.'}
            </p>
          </div>
        )}
      </div>

      <Toast message={message} variant={messageType} />
    </DashboardLayout>
  );
}