import React from 'react';
import { Link } from 'react-router-dom';

import homeIcon from '../assets/home.png';
import infoIcon from '../assets/info.png';
import priceIcon from '../assets/price.png';
import helpCenterIcon from '../assets/help-center.png';
import logoImage from '../assets/logo.png';

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

function Brand() {
  return (
    <Link to="/" className="brand" aria-label="AgriGuard home">
      <img
        src={logoImage}
        alt="AgriGuard logo"
        className="brand-image"
      />
    </Link>
  );
}

export default function PublicLayout({ children, sidebarActive }) {
  return (
    <div className="app-shell public-shell">
      <header className="topbar">
        <Brand />

        <div className="top-links">
          <Link to="/login">Log in</Link>
          <Link to="/signup">Sign Up</Link>

          <div className="avatar-link" aria-hidden="true">
            <ProfileAvatarIcon />
          </div>
        </div>
      </header>

      <aside className="sidebar public-sidebar">
        <Link
          to="/"
          className={`side-link ${sidebarActive === 'home' ? 'active' : ''}`}
        >
          <span className="side-icon">
            <img src={homeIcon} alt="" className="side-icon-image" />
          </span>
          <span>Home</span>
        </Link>

        <Link
          to="/pricing"
          className={`side-link ${sidebarActive === 'pricing' ? 'active' : ''}`}
        >
          <span className="side-icon">
            <img src={priceIcon} alt="" className="side-icon-image" />
          </span>
          <span>Pricing</span>
        </Link>

        <Link
          to="/about"
          className={`side-link ${sidebarActive === 'about' ? 'active' : ''}`}
        >
          <span className="side-icon">
            <img src={infoIcon} alt="" className="side-icon-image" />
          </span>
          <span>About Us</span>
        </Link>

        <Link
          to="/help-center"
          className={`side-link help-center help-center-link ${
            sidebarActive === 'help-center' ? 'active' : ''
          }`}
        >
          <span className="side-icon">
            <img src={helpCenterIcon} alt="" className="side-icon-image" />
          </span>
          <span>Help Center</span>
        </Link>
      </aside>

      <main className="content">{children}</main>
    </div>
  );
}