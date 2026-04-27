import React from 'react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import PublicLayout from '../layouts/PublicLayout';
import farmerImage from '../assets/farmer.png';

import { forgotPassword } from '../services/authApi';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setMessage('');
    setError('');

    const response = await forgotPassword({ email });

    setLoading(false);

    if (!response.success) {
      setError(
        response.message || 'Could not submit your password reset request.'
      );
      return;
    }

    setMessage(
      response.data?.message ||
        'If that email exists in AgriGuard, a reset link has been sent.'
    );
  }

  return (
    <PublicLayout sidebarActive="login">
      <div className="auth-page">
        <section className="auth-stage auth-stage-clean">
          <div className="auth-card login-card-custom">
            <div className="auth-card-header auth-card-header-simple">
              <h1>Reset your password</h1>
            </div>

            <p className="auth-subtitle">
              Enter your account email and we will send you a password reset
              link.
            </p>

            <form className="auth-form" onSubmit={handleSubmit}>
              <input
                className="input"
                type="email"
                name="email"
                placeholder="name@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />

              <div className="action-row login-action-row">
                <button
                  type="submit"
                  className="primary-button login-button"
                  disabled={loading}
                >
                  {loading ? 'Sending...' : 'Send reset link'}
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
