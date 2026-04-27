import React from 'react';
import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import PublicLayout from '../layouts/PublicLayout';
import { getDashboardPath, getRedirectLabel } from '../utils/roleHelpers';

function getSafeTarget(target, role) {
  if (!target || typeof target !== 'string' || !target.startsWith('/')) {
    return getDashboardPath(role);
  }

  return target;
}

export default function RedirectingPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const role = user?.role || 'player';
  const target = getSafeTarget(searchParams.get('target'), role);

  useEffect(() => {
    const timeout = setTimeout(() => navigate(target, { replace: true }), 900);
    return () => clearTimeout(timeout);
  }, [navigate, target]);

  return (
    <PublicLayout sidebarActive="login">
      <div className="center-stage">
        <div className="message-card redirect-card">
          <div className="spinner" />
          <p>Redirecting to {getRedirectLabel(role)} dashboard</p>
        </div>
      </div>
    </PublicLayout>
  );
}

