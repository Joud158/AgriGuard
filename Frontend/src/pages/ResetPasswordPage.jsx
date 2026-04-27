import React from 'react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import PublicLayout from '../layouts/PublicLayout';
import farmerImage from '../assets/farmer.png';

import { resetPassword } from '../services/authApi';

export default function ResetPasswordPage() {
  const { token } = useParams();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    password: '',
    confirmPassword: '',
  });

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  function handleChange(event) {
    const { name, value } = event.target;

    setForm((current) => ({
      ...current,
      [name]: value,
    }));

    setFieldErrors((current) => ({
      ...current,
      [name]: '',
    }));

    setError('');
  }

  async function handleSubmit(event) {
    event.preventDefault();

    setLoading(true);
    setMessage('');
    setError('');

    const response = await resetPassword(token, form);

    setLoading(false);

    if (!response.success) {
      setFieldErrors(response.errors || {});
      setError(response.message || 'Could not reset your password.');
      return;
    }

    const successText =
      response.data?.message || 'Your password has been reset successfully.';

    setMessage(successText);

    setTimeout(() => {
      navigate('/login', {
        replace: true,
        state: {
          message: successText,
        },
      });
    }, 1200);
  }

  return (
    <PublicLayout sidebarActive="login">
      <div className="auth-page">
        <section className="auth-stage auth-stage-clean">
          <div className="auth-card login-card-custom">
            <div className="auth-card-header auth-card-header-simple">
              <h1>Create a new password</h1>
            </div>

            <p className="auth-subtitle">
              Choose a strong new password for your AgriGuard account.
            </p>

            <form className="auth-form" onSubmit={handleSubmit}>
              <input
                className={fieldErrors.password ? 'input error' : 'input'}
                type="password"
                name="password"
                placeholder="New password"
                value={form.password}
                onChange={handleChange}
              />
              {fieldErrors.password ? (
                <div className="inline-error">{fieldErrors.password}</div>
              ) : null}

              <input
                className={
                  fieldErrors.confirmPassword ? 'input error' : 'input'
                }
                type="password"
                name="confirmPassword"
                placeholder="Confirm new password"
                value={form.confirmPassword}
                onChange={handleChange}
              />
              {fieldErrors.confirmPassword ? (
                <div className="inline-error">
                  {fieldErrors.confirmPassword}
                </div>
              ) : null}

              <div className="action-row login-action-row">
                <button
                  type="submit"
                  className="primary-button login-button"
                  disabled={loading}
                >
                  {loading ? 'Saving...' : 'Reset password'}
                </button>
              </div>

              {message ? <div className="success-banner">{message}</div> : null}

              {error ? (
                <div className="inline-error centered-text">{error}</div>
              ) : null}

              <div className="form-divider" />

              <Link to="/login" className="muted-link">
                Back to login
              </Link>
            </form>
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
