import React from 'react';
import { useAuth } from '../context/AuthContext';
import DashboardLayout from '../layouts/DashboardLayout';
import PublicLayout from '../layouts/PublicLayout';

export default function HelpCenterPage() {
  const { user, initializing } = useAuth();

  const content = (
    <div className="simple-page">
      <div className="page-head compact">
        <div>
          <h1>Help Center</h1>
          <p>Find support for account access, farmer invitations, field monitoring, visit requests, and communication.</p>
        </div>
      </div>

      <div className="help-grid">
        <div className="info-card">
          <h3>Account Access</h3>
          <p>If you cannot log in, contact your farm network administrator to confirm your account status.</p>
        </div>

        <div className="info-card">
          <h3>Invitations</h3>
          <p>If your invitation link expired, request a new invite from the administrator.</p>
        </div>

        <div className="info-card">
          <h3>Farmer Features</h3>
          <p>Farmers can view satellite field analytics, upload crop photos for AI diagnosis, request agronomist support, and chat with the farm network team.</p>
        </div>

        <div className="info-card">
          <h3>Support</h3>
          <p>For additional help, contact your farm network administrator or the platform support team.</p>
        </div>
      </div>
    </div>
  );

  if (initializing) {
    return (
      <div className="center-stage">
        <div className="message-card redirect-card">
          <div className="spinner" />
          <p>Checking your session...</p>
        </div>
      </div>
    );
  }

  if (user) {
    return <DashboardLayout role={user.role}>{content}</DashboardLayout>;
  }

  return (
    <PublicLayout sidebarActive="help-center">
      {content}
    </PublicLayout>
  );
}
