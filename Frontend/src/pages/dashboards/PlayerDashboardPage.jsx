import React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import DashboardLayout from '../../layouts/DashboardLayout';
import { useAuth } from '../../context/AuthContext';
import { getEvents, getPlayers, getTeams } from '../../services/authApi';

function formatEventDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}

function formatEventTimeRange(startIso, endIso) {
  const start = new Date(startIso).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });

  const end = new Date(endIso).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });

  return `${start} - ${end}`;
}

function ScheduleCard({ title, event, emptyText, viewAllLink }) {
  return (
    <article className="dashboard-card player-schedule-card">
      <h2>{title}</h2>

      {event ? (
        <>
          <div className="player-schedule-details">
            <span>{formatEventDate(event.start_time)}</span>
            <span>{formatEventTimeRange(event.start_time, event.end_time)}</span>
            <span>{event.location || 'Location not set'}</span>
          </div>

          <div className="player-schedule-actions">
            <Link className="primary-button full-width" to={`/events/${event.id}`}>
              View visit details
            </Link>

            <Link className="secondary-button full-width" to="/chat">
              Message agronomist
            </Link>
          </div>
        </>
      ) : (
        <>
          <div className="player-schedule-details">
            <span>{emptyText}</span>
            <span>Check the satellite monitor or chat with an agronomist.</span>
          </div>

          <div className="player-schedule-actions">
            <Link className="primary-button full-width" to={viewAllLink}>
              View all visits
            </Link>
          </div>
        </>
      )}
    </article>
  );
}

export default function PlayerDashboardPage() {
  const { user } = useAuth();

  const [events, setEvents] = useState([]);
  const [teams, setTeams] = useState([]);
  const [players, setPlayers] = useState([]);

  useEffect(() => {
    let active = true;

    async function load() {
      const [eventsResponse, teamsResponse, playersResponse] = await Promise.all([
        getEvents(),
        getTeams(),
        getPlayers(),
      ]);

      if (!active) return;

      setEvents(eventsResponse.success ? eventsResponse.data || [] : []);
      setTeams(teamsResponse.success ? teamsResponse.data || [] : []);
      setPlayers(playersResponse.success ? playersResponse.data || [] : []);
    }

    load().catch(() => {
      if (active) {
        setEvents([]);
        setTeams([]);
        setPlayers([]);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  const currentPlayer = useMemo(
    () => players.find((player) => player.user?.id === user?.id) || null,
    [players, user?.id]
  );

  const currentTeamId = useMemo(() => {
    if (currentPlayer?.team_membership?.team_id) {
      return currentPlayer.team_membership.team_id;
    }

    if (!user?.team) {
      return '';
    }

    return teams.find((team) => team.name === user.team)?.id || '';
  }, [currentPlayer?.team_membership?.team_id, teams, user?.team]);

  const upcomingTeamEvents = useMemo(
    () =>
      events
        .filter((event) => {
          const isSameField = !currentTeamId || event.team_id === currentTeamId;
          const isUpcoming = new Date(event.end_time || event.start_time).getTime() > Date.now();

          return isSameField && isUpcoming;
        })
        .sort((a, b) => new Date(a.start_time) - new Date(b.start_time)),
    [currentTeamId, events]
  );

  const nextVisit = useMemo(
    () =>
      upcomingTeamEvents.find((event) => event.type !== 'meeting') ||
      upcomingTeamEvents[0] ||
      null,
    [upcomingTeamEvents]
  );

  const nextAdvisory = useMemo(
    () => upcomingTeamEvents.find((event) => event.type === 'meeting') || null,
    [upcomingTeamEvents]
  );

  return (
    <DashboardLayout role="player">
      <section className="page-head compact">
        <div>
          <span className="hero-eyebrow">Farmer dashboard</span>
          <h1>Welcome back, Farmer!</h1>
          <p>
            Track alerts, upload crop symptoms, and coordinate with agronomists before
            losses increase.
          </p>
        </div>
      </section>

      <section className="player-dashboard-grid">
        <ScheduleCard
          title="Next Field Visit"
          event={nextVisit}
          emptyText="No upcoming field visit scheduled."
          viewAllLink="/events"
        />

        <ScheduleCard
          title="Next Advisory Call"
          event={nextAdvisory}
          emptyText="No upcoming advisory call scheduled."
          viewAllLink="/events?type=meeting"
        />
      </section>

      <section className="player-dashboard-actions">
        <Link className="primary-button" to="/diagnosis">
          Upload Photo / AI Diagnosis
        </Link>

        <Link className="secondary-button" to="/events">
          View Calendar
        </Link>

        <Link className="secondary-button" to="/chat">
          Chat with Agronomist
        </Link>
      </section>
    </DashboardLayout>
  );
}