import React from 'react';
import { Link, useLocation } from 'react-router-dom';

import { useAuth } from '../context/AuthContext';
import NotificationBell from '../components/NotificationBell';
import { getDashboardPath } from '../utils/roleHelpers';

import dataSatIcon from '../assets/data-sat.png';
import helpCenterIcon from '../assets/help-center.png';
import homeIcon from '../assets/home.png';
import peopleIcon from '../assets/people.png';
import fieldIcon from '../assets/satellite-icon.png';
import calendarIcon from '../assets/calendar.png';
import chatIcon from '../assets/email.png';
import createUserIcon from '../assets/adduser.png';
import infoIcon from '../assets/info.png';
import diagnosisIcon from '../assets/ai.png';
import logoImage from '../assets/logo.png';

const navConfig = {
  admin: [
    { label: 'Dashboard', icon: homeIcon, to: '/admin' },
    { label: 'Satellite Data', icon: dataSatIcon, to: '/satellite', matchPrefix: '/satellite' },
    { label: 'Calendar To-Dos', icon: calendarIcon, to: '/events', matchPrefix: '/events' },
    { label: 'Announcements', icon: infoIcon, to: '/announcements', matchPrefix: '/announcements' },
    { label: 'Farmers & Fields', icon: fieldIcon, to: '/teams', matchPrefix: '/teams' },
    { label: 'Create Farmers/Agronomists', icon: createUserIcon, to: '/admin/create-user' },
    { label: 'Users & Assignments', icon: peopleIcon, to: '/admin/users-assignments' },
    { label: 'Chat', icon: chatIcon, to: '/chat', matchPrefix: '/chat' },
  ],

  coach: [
    { label: 'Dashboard', icon: homeIcon, to: '/coach' },
    { label: 'Satellite Data', icon: dataSatIcon, to: '/satellite', matchPrefix: '/satellite' },
    { label: 'Calendar', icon: calendarIcon, to: '/events', matchPrefix: '/events' },
    { label: 'Announcements', icon: infoIcon, to: '/announcements', matchPrefix: '/announcements' },
    { label: 'Chat', icon: chatIcon, to: '/chat', matchPrefix: '/chat' },
  ],

  player: [
    { label: 'Dashboard', icon: homeIcon, to: '/player' },
    { label: 'Satellite Analytics', icon: dataSatIcon, to: '/satellite', matchPrefix: '/satellite' },
    { label: 'AI Crop Doctor', icon: diagnosisIcon, to: '/diagnosis', matchPrefix: '/diagnosis' },
    { label: 'Calendar', icon: calendarIcon, to: '/events', matchPrefix: '/events' },
    { label: 'Announcements', icon: infoIcon, to: '/announcements', matchPrefix: '/announcements' },
    { label: 'Chat', icon: chatIcon, to: '/chat', matchPrefix: '/chat' },
  ],
};

function Logo({ to }) {
  return (
    <Link to={to} className="brand" aria-label="AgriGuard home">
      <img src={logoImage} alt="AgriGuard logo" className="brand-image" />
    </Link>
  );
}

function ProfileAvatarIcon() {
  return (
    <svg
      className="avatar-svg"
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="9" r="3" />
      <path d="M16 17c0-2-1.8-3.5-4-3.5S8 15 8 17" />
    </svg>
  );
}

export default function DashboardLayout({ role, children }) {
  const { pathname } = useLocation();
  const { user } = useAuth();

  const items = navConfig[role] ?? [];
  const homeTarget = user ? getDashboardPath(user.role) : '/';

  const isActive = (item) =>
    pathname === item.to ||
    (item.matchPrefix && pathname.startsWith(item.matchPrefix));

  return (
    <div className="app-shell dashboard-shell">
      <header className="topbar dashboard-topbar">
        <Logo to={homeTarget} />

        <nav className="top-links">
          <NotificationBell />

          <Link className="top-link" to="/profile">
            Profile
          </Link>

          <Link
            className="avatar-link"
            to="/profile"
            aria-label={`Open ${user?.fullName || 'profile'}`}
          >
            <ProfileAvatarIcon />
          </Link>
        </nav>
      </header>

      <aside className="sidebar dashboard-sidebar">
        {items.map((item) => (
          <Link
            key={item.label}
            className={isActive(item) ? 'side-link active' : 'side-link'}
            to={item.to}
          >
            <span className="side-icon">
              <img src={item.icon} alt="" className="side-icon-image" />
            </span>
            <span>{item.label}</span>
          </Link>
        ))}

        <Link
          className={
            pathname === '/help-center'
              ? 'help-center side-link active'
              : 'help-center side-link'
          }
          to="/help-center"
        >
          <span className="side-icon">
            <img src={helpCenterIcon} alt="" className="side-icon-image" />
          </span>
          <span>Help Center</span>
        </Link>
      </aside>

      <main className="content dashboard-content">{children}</main>
    </div>
  );
}