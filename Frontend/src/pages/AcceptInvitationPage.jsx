import React from 'react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import FormField from '../components/FormField';
import PublicLayout from '../layouts/PublicLayout';

import { useAuth } from '../context/AuthContext';
import { getInvitation } from '../services/authApi';
import { validateAcceptInvitation } from '../utils/validation';
import { getDashboardPath } from '../utils/roleHelpers';

import farmerImage from '../assets/farmer.png';

function getRoleLabel(role) {
  if (role === 'coach') return 'Agronomist';
  if (role === 'player') return 'Farmer';
  if (role === 'admin') return 'Administrator';
  return role;
}

export default function AcceptInvitationPage() {
  const { token } = useParams();
  const { acceptInvitation, loading } = useAuth();
  const navigate = useNavigate();

  const [invitation, setInvitation] = useState(null);
  const [pageError, setPageError] = useState('');
  const [fetching, setFetching] = useState(true);

  const [values, setValues] = useState({
    fullName: '',
    password: '',
    confirmPassword: '',
  });

  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');

  useEffect(() => {
    let mounted = true;

    async function loadInvitation() {
      const response = await getInvitation(token);

      if (!mounted) return;

      if (!response.success) {
        setPageError(response.message || 'Unable to load this invitation.');
      } else {
        setInvitation(response.data);
        setValues((current) => ({
          ...current,
          fullName: current.fullName || response.data.fullName || '',
        }));
      }

      setFetching(false);
    }

    loadInvitation().catch(() => {
      if (!mounted) return;

      setPageError('Unable to load this invitation. Please try again later.');
      setFetching(false);
    });

    return () => {
      mounted = false;
    };
  }, [token]);

  function handleChange(event) {
    const { name, value } = event.target;

    setValues((current) => ({
      ...current,
      [name]: value,
    }));

    setErrors((current) => ({
      ...current,
      [name]: '',
    }));

    setServerError('');
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const nextErrors = validateAcceptInvitation(values);
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length) {
      return;
    }

    const response = await acceptInvitation(token, values);

    if (!response.success) {
      setErrors(response.errors ?? {});
      setServerError(response.message || 'Unable to activate the account.');
      return;
    }

    navigate(
      `/redirecting?target=${encodeURIComponent(
        getDashboardPath(response.data.user.role)
      )}`
    );
  }

  const roleLabel = invitation ? getRoleLabel(invitation.role) : '';

  return (
    <PublicLayout
      sidebarActive="login"
      topLinks={
        <>
          <Link to="/login">Log in</Link>
          <Link to="/signup">Sign Up</Link>
        </>
      }
    >
      <div className="auth-page">
        <section className="auth-stage auth-stage-clean">
          <div className="auth-card signup-card">
            <div className="auth-card-header auth-card-header-simple">
              <h1>Accept invitation</h1>
            </div>

            {fetching ? (
              <p className="auth-subtitle">Checking invitation...</p>
            ) : pageError ? (
              <div className="inline-error">{pageError}</div>
            ) : (
              <>
                <p className="auth-subtitle">
                  You were invited as a <strong>{roleLabel}</strong>
                  {invitation.team ? ` for ${invitation.team}` : ''}. Create
                  your password to activate your AgriGuard account.
                </p>

                <div className="invitation-chip-row">
                  <span className="chip">{invitation.email}</span>
                  <span className="chip accent">{roleLabel}</span>
                  {invitation.team ? (
                    <span className="chip">{invitation.team}</span>
                  ) : null}
                </div>

                <form onSubmit={handleSubmit} className="auth-form grouped-form">
                  <FormField
                    name="fullName"
                    placeholder="Full name"
                    value={values.fullName}
                    onChange={handleChange}
                    error={errors.fullName}
                  />

                  <FormField
                    name="password"
                    type="password"
                    placeholder="Create password"
                    value={values.password}
                    onChange={handleChange}
                    error={errors.password}
                  />

                  <FormField
                    name="confirmPassword"
                    type="password"
                    placeholder="Confirm password"
                    value={values.confirmPassword}
                    onChange={handleChange}
                    error={errors.confirmPassword}
                  />

                  {serverError ? (
                    <div className="inline-error">{serverError}</div>
                  ) : null}

                  <button
                    className="primary-button full-width"
                    disabled={loading}
                    type="submit"
                  >
                    {loading ? 'Activating account...' : 'Activate account'}
                  </button>
                </form>
              </>
            )}
          </div>

          <div className="auth-image-panel">
            <img
              src={farmerImage}
              alt="Farmer using AgriGuard crop monitoring platform"
              className="auth-player-image"
            />
          </div>
        </section>
      </div>
    </PublicLayout>
  );
}
