import React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import DashboardLayout from '../../layouts/DashboardLayout';
import MetricCard from '../../components/MetricCard';
import Toast from '../../components/Toast';

import totalTeamsIcon from '../../assets/data-sat.png';
import totalPlayersIcon from '../../assets/people.png';
import totalCoachesIcon from '../../assets/people.png';
import calendarIcon from '../../assets/calendar.png';

import { getEvents, getTeams, getTeamsSummary } from '../../services/authApi';

function formatEventDateTime(iso) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function AdminDashboardPage() {
  const [summary, setSummary] = useState({
    total_teams: 0,
    total_players: 0,
    total_coaches: 0,
  });
  const [events, setEvents] = useState([]);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;

    async function load() {
      const [summaryResponse, eventsResponse, teamsResponse] = await Promise.all([
        getTeamsSummary(),
        getEvents(),
        getTeams(),
      ]);

      if (!active) return;

      if (!summaryResponse.success) {
        setMessage(summaryResponse.message || 'Unable to load dashboard metrics.');
        setLoading(false);
        return;
      }

      setSummary(summaryResponse.data);
      setEvents(eventsResponse.success ? eventsResponse.data || [] : []);
      setTeams(teamsResponse.success ? teamsResponse.data || [] : []);
      setLoading(false);
    }

    load().catch(() => {
      if (active) {
        setMessage('Unable to load admin dashboard data right now.');
        setLoading(false);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  const teamNamesById = useMemo(
    () =>
      teams.reduce(
        (lookup, team) => ({
          ...lookup,
          [team.id]: team.name,
        }),
        {}
      ),
    [teams]
  );

  const upcomingEvents = useMemo(
    () =>
      events
        .filter((event) => new Date(event.end_time || event.start_time).getTime() > Date.now())
        .sort((a, b) => new Date(a.start_time) - new Date(b.start_time))
        .slice(0, 5)
        .map((event) => ({
          ...event,
          team_name: teamNamesById[event.team_id] || 'Farm unavailable',
        })),
    [events, teamNamesById]
  );

  return (
    <DashboardLayout role="admin">
      <section className="page-head admin-head">
        <div>
          <span className="hero-eyebrow">Operations command center</span>
          <h1>Welcome back, Administrator!</h1>
          <p>Monitor farms, agronomists, farmers, satellite alerts, and field visit workflows.</p>
        </div>

        <div className="head-actions stacked">
          <Link className="primary-button" to="/admin/create-user">
            Create User
          </Link>
          <Link className="primary-button" to="/events/create">
            Add To-Do
          </Link>
        </div>
      </section>

      <section className="metric-grid four-up">
        <MetricCard
          icon={totalTeamsIcon}
          title="Monitored Farms"
          value={loading ? '...' : String(summary.total_teams)}
        />
        <MetricCard
          icon={totalPlayersIcon}
          title="Registered Farmers"
          value={loading ? '...' : String(summary.total_players)}
        />
        <MetricCard
          icon={totalCoachesIcon}
          title="Agronomists"
          value={loading ? '...' : String(summary.total_coaches)}
        />
        <MetricCard
          icon={calendarIcon}
          title="Scheduled To-Dos"
          value={loading ? '...' : String(events.length)}
        />
      </section>

      <section className="dashboard-card admin-calendar-card">
        <div className="admin-calendar-content">
          <div className="section-row admin-calendar-head">
            <h2>Field Visit Overview</h2>
            <Link className="primary-button small" to="/events">
              View Calendar
            </Link>
          </div>

          <div className="event-list-card">
            <div className="event-list-title">Upcoming Visits & Inspections</div>

            {loading ? (
              <p className="admin-calendar-empty">Loading upcoming visits...</p>
            ) : upcomingEvents.length ? (
              <ul>
                {upcomingEvents.map((event) => (
                  <li key={event.id}>
                    <span>{formatEventDateTime(event.start_time)}</span>
                    <strong>{event.title}</strong>
                    <em>{event.team_name}</em>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="admin-calendar-empty">No upcoming field visits scheduled.</p>
            )}
          </div>
        </div>
      </section>

      <Toast message={message} variant="error" />
    </DashboardLayout>
  );
}
