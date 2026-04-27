import React from 'react';
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import PublicLayout from '../layouts/PublicLayout';
import farmerImage from '../assets/farmer.png';

import { useAuth } from '../context/AuthContext';
import { getDashboardPath } from '../utils/roleHelpers';
import { validateLogin } from '../utils/validation';

const LOGIN_NOTICE_KEY = 'agriguard-login-notice';

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, completeMfaLogin, loading } = useAuth();

  const [form, setForm] = useState({
    email: '',
    password: '',
  });

  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [mfaChallengeToken, setMfaChallengeToken] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [pendingUserLabel, setPendingUserLabel] = useState('');
  const [redirectNotice, setRedirectNotice] = useState('');

  const noticeMessage = location.state?.message || redirectNotice;

  useEffect(() => {
    const storedNotice = sessionStorage.getItem(LOGIN_NOTICE_KEY) || '';

    if (!storedNotice) {
      return;
    }

    setRedirectNotice(storedNotice);
    sessionStorage.removeItem(LOGIN_NOTICE_KEY);
  }, []);

  function handleChange(event) {
    const { name, value } = event.target;

    setForm((current) => ({
      ...current,
      [name]: value,
    }));

    setErrors((current) => ({
      ...current,
      [name]: '',
    }));

    setServerError('');
  }

  function navigateToDashboard(userRole) {
    const fallbackTarget = getDashboardPath(userRole);
    const target = location.state?.from?.pathname || fallbackTarget;

    navigate(`/redirecting?target=${encodeURIComponent(target)}`);
  }

  async function handlePrimaryLogin(event) {
    event.preventDefault();

    const nextErrors = validateLogin(form);
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length) {
      return;
    }

    const response = await login(form);

    if (!response.success) {
      setErrors(response.errors ?? {});
      setServerError(response.message || 'Login failed.');
      return;
    }

    if (response.data?.mfaRequired) {
      setMfaChallengeToken(response.data.challengeToken);
      setPendingUserLabel(response.data.user?.email || form.email);
      setServerError('');
      return;
    }

    navigateToDashboard(response.data.user.role);
  }

  async function handleMfaVerification(event) {
    event.preventDefault();

    const normalizedCode = mfaCode.replace(/\s+/g, '');

    if (!/^\d{6}$/.test(normalizedCode)) {
      setServerError('Enter the 6-digit code from your authenticator app.');
      return;
    }

    const response = await completeMfaLogin(mfaChallengeToken, normalizedCode);

    if (!response.success) {
      setErrors(response.errors ?? {});
      setServerError(response.message || 'MFA verification failed.');
      return;
    }

    navigateToDashboard(response.data.user.role);
  }

  function resetMfaStep() {
    setMfaChallengeToken('');
    setMfaCode('');
    setServerError('');
  }

  return (
    <PublicLayout sidebarActive="login">
      <div className="auth-page">
        <section className="auth-stage auth-stage-clean">
          <div className="auth-card login-card-custom">
            <div className="auth-card-header auth-card-header-simple">
              <h1>
                {mfaChallengeToken
                  ? 'Verify your authenticator code'
                  : 'Login to AgriGuard'}
              </h1>
            </div>

            <p className="auth-subtitle">
              {mfaChallengeToken
                ? `Enter the 6-digit code for ${
                    pendingUserLabel || 'your account'
                  } from your authenticator app.`
                : 'A smart crop monitoring platform for farmers, agronomists, and field teams.'}
            </p>

            {!mfaChallengeToken ? (
              <form className="auth-form" onSubmit={handlePrimaryLogin}>
                <input
                  className={errors.email ? 'input error' : 'input'}
                  type="email"
                  name="email"
                  placeholder="name@example.com"
                  value={form.email}
                  onChange={handleChange}
                />
                {errors.email ? (
                  <div className="inline-error">{errors.email}</div>
                ) : null}

                <input
                  className={errors.password ? 'input error' : 'input'}
                  type="password"
                  name="password"
                  placeholder="Password"
                  value={form.password}
                  onChange={handleChange}
                />
                {errors.password ? (
                  <div className="inline-error">{errors.password}</div>
                ) : null}

                <div className="action-row login-action-row">
                  <button
                    type="submit"
                    className="primary-button login-button"
                    disabled={loading}
                  >
                    {loading ? 'Logging in...' : 'Log in'}
                  </button>
                </div>

                <div className="forgot-password-row">
                  <Link to="/forgot-password" className="muted-link">
                    Forgot password?
                  </Link>
                </div>

                {noticeMessage ? (
                  <div className="success-banner">{noticeMessage}</div>
                ) : null}

                {serverError ? (
                  <div className="inline-error centered-text">
                    {serverError}
                  </div>
                ) : null}

                <div className="form-divider" />

                <p className="support-text">
                  Need access? Contact your farm network administrator.
                </p>
              </form>
            ) : (
              <form className="auth-form" onSubmit={handleMfaVerification}>
                <input
                  className="input"
                  type="text"
                  name="mfaCode"
                  placeholder="123456"
                  inputMode="numeric"
                  maxLength={6}
                  value={mfaCode}
                  onChange={(event) => {
                    setMfaCode(
                      event.target.value.replace(/[^0-9]/g, '').slice(0, 6)
                    );
                    setServerError('');
                  }}
                />

                <div className="action-row login-action-row mfa-action-row">
                  <button
                    type="submit"
                    className="primary-button login-button"
                    disabled={loading}
                  >
                    {loading ? 'Verifying...' : 'Verify code'}
                  </button>

                  <button
                    type="button"
                    className="secondary-button"
                    onClick={resetMfaStep}
                  >
                    Back
                  </button>
                </div>

                {serverError ? (
                  <div className="inline-error centered-text">
                    {serverError}
                  </div>
                ) : null}
              </form>
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
