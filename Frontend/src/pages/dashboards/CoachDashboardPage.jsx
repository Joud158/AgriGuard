import React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '../../layouts/DashboardLayout';
import MetricCard from '../../components/MetricCard';
import { useAuth } from '../../context/AuthContext';
import { getEvents, getTeams, getPlayers } from '../../services/authApi';
import calendarIcon from '../../assets/calendar.png';
import teamIcon from '../../assets/satellite.png';
import peopleIcon from '../../assets/people.png';
import aiIcon from '../../assets/ai.png';

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

export default function CoachDashboardPage() {
  const { user } = useAuth();
  const [events, setEvents] = useState([]);
  const [teams, setTeams] = useState([]);
  const [players, setPlayers] = useState([]);

  useEffect(() => {
    let active = true;

    Promise.all([getEvents(), getTeams(), getPlayers()]).then(([er, tr, pr]) => {
      if (!active) return;
      if (er.success) setEvents(er.data || []);
      if (tr.success) setTeams(tr.data || []);
      if (pr.success) setPlayers(pr.data || []);
    });

    return () => {
      active = false;
    };
  }, []);

  const today = new Date();

  const todayEvents = useMemo(
    () =>
      events.filter((evt) => {
        const d = new Date(evt.start_time);
        return (
          d.getFullYear() === today.getFullYear() &&
          d.getMonth() === today.getMonth() &&
          d.getDate() === today.getDate()
        );
      }),
    [events]
  );

  const upcomingEvents = useMemo(
    () =>
      events
        .filter((e) => new Date(e.start_time).getTime() > Date.now())
        .sort((a, b) => new Date(a.start_time) - new Date(b.start_time))
        .slice(0, 5),
    [events]
  );

  const visitsThisWeek = useMemo(() => {
    const start = new Date(today);
    start.setDate(today.getDate() - today.getDay() + 1);
    start.setHours(0, 0, 0, 0);

    const end = new Date(start);
    end.setDate(start.getDate() + 7);

    return events.filter((e) => {
      const d = new Date(e.start_time);
      return d >= start && d < end;
    }).length;
  }, [events]);

  const coachedTeams = useMemo(
    () => teams.filter((team) => team.coach?.id === user?.id),
    [teams, user?.id]
  );

  const coachedTeamIds = useMemo(
    () => new Set(coachedTeams.map((team) => team.id)),
    [coachedTeams]
  );

  const coachedPlayers = useMemo(
    () =>
      players.filter(
        (player) =>
          player.team_membership && coachedTeamIds.has(player.team_membership.team_id)
      ),
    [coachedTeamIds, players]
  );

  return (
    <DashboardLayout role="coach">
      <section className="page-head compact">
        <div>
          <span className="hero-eyebrow">Agronomist workspace</span>
          <h1>Welcome back, Agronomist!</h1>
          <p>
            Review field risk signals, coordinate farm visits, and advise farmers
            before outbreaks spread.
          </p>
        </div>
      </section>

      <section className="quick-actions">
        <Link to="/satellite" className="quick-action-card">
          <img src={aiIcon} alt="" className="quick-action-icon" />
          <span>Review Satellite Alerts</span>
        </Link>

        <Link to="/event-requests" className="quick-action-card">
          <img src={calendarIcon} alt="" className="quick-action-icon" />
          <span>Accept/Reject Requests</span>
        </Link>

        <Link to="/events" className="quick-action-card">
          <img src={calendarIcon} alt="" className="quick-action-icon" />
          <span>Check Calendar</span>
        </Link>

        <Link to="/chat" className="quick-action-card">
          <img src={peopleIcon} alt="" className="quick-action-icon" />
          <span>Message Farmers/Admin</span>
        </Link>
      </section>

      <section className="metric-grid four-up">
        <MetricCard
          icon={calendarIcon}
          title="Next Visit"
          value={upcomingEvents[0] ? upcomingEvents[0].title : 'None'}
        />
        <MetricCard icon={calendarIcon} title="Visits this week" value={String(visitsThisWeek)} />
        <MetricCard icon={teamIcon} title="My Farms" value={String(coachedTeams.length)} />
        <MetricCard
          icon={peopleIcon}
          title="Farmers Supported"
          value={String(coachedPlayers.length)}
        />
      </section>

      <section className="coach-home-grid">
        <div className="dashboard-card schedule-card">
          <h2>Today&apos;s Visits</h2>
          <div className="schedule-date">
            {today.toLocaleDateString(undefined, {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
          </div>

          {todayEvents.length === 0 ? (
            <p style={{ color: 'var(--muted)' }}>No field visits scheduled for today.</p>
          ) : (
            <div className="schedule-list">
              {todayEvents.map((evt) => (
                <div key={evt.id} className="schedule-item">
                  <div className="schedule-item-text">
                    <strong>{evt.title}</strong>
                    <span>
                      {evt.location ? `${evt.location}, ` : ''}
                      {formatTime(evt.start_time)} to {formatTime(evt.end_time)}
                    </span>
                  </div>
                  <Link to={`/events/${evt.id}`} className="mini-link">
                    View
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="dashboard-card">
          <div className="section-row">
            <h2>Upcoming Field Visits</h2>
            <Link to="/events" className="mini-link">
              View all
            </Link>
          </div>

          {upcomingEvents.length === 0 ? (
            <p style={{ color: 'var(--muted)' }}>No upcoming field visits.</p>
          ) : (
            <div className="upcoming-list">
              {upcomingEvents.map((evt) => (
                <Link key={evt.id} to={`/events/${evt.id}`} className="upcoming-row">
                  <div className="upcoming-date-badge">
                    <span>{formatDate(evt.start_time)}</span>
                  </div>
                  <div className="upcoming-info">
                    <strong>{evt.title}</strong>
                    <span>
                      {formatTime(evt.start_time)}
                      {evt.location ? ` · ${evt.location}` : ''}
                    </span>
                  </div>
                  <span className="upcoming-type">{evt.type}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
    </DashboardLayout>
  );
}
