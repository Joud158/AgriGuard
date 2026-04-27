import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getDashboardPath } from '../utils/roleHelpers';
import PublicLayout from '../layouts/PublicLayout';
import DashboardLayout from '../layouts/DashboardLayout';

function UnauthorizedContent({ onReturn }) {
  return (
    <div className="center-stage">
      <div className="message-card">
        <div className="message-icon">⚠</div>
        <h1>Access Restricted</h1>
        <p>You do not have permission to access this feature.</p>
        <button className="primary-button" type="button" onClick={onReturn}>
          Return to dashboard
        </button>
      </div>
    </div>
  );
}

export default function UnauthorizedPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const handleReturn = () => {
    navigate(user ? getDashboardPath(user.role) : '/login');
  };

  if (user) {
    return (
      <DashboardLayout role={user.role}>
        <UnauthorizedContent onReturn={handleReturn} />
      </DashboardLayout>
    );
  }

  return (
    <PublicLayout sidebarActive="login">
      <UnauthorizedContent onReturn={handleReturn} />
    </PublicLayout>
  );
}
