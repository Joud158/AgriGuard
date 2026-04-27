import React from 'react';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import PublicLayout from '../layouts/PublicLayout';
import farmerImage from '../assets/farmer.png';

import { verifyAdminEmail } from '../services/authApi';

export default function VerifyEmailPage() {
  const { token } = useParams();

  const [status, setStatus] = useState('loading');
  const [message, setMessage] = useState('Verifying your account...');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('No verification token found.');
      return;
    }

    const verifyAndRedirect = async () => {
      try {
        const response = await verifyAdminEmail(token);

        if (!response?.success) {
          setStatus('error');
          setMessage(
            response?.message || 'This verification link is invalid or expired.'
          );
          return;
        }

        setStatus('success');
        setMessage('Email verified successfully. Redirecting to login...');

        setTimeout(() => {
          window.location.replace('/login');
        }, 1200);
      } catch (error) {
        setStatus('error');
        setMessage(
          'We could not verify your email right now. Please try again later.'
        );
      }
    };

    verifyAndRedirect();
  }, [token]);

  const heading =
    status === 'success'
      ? 'Email verified'
      : status === 'error'
      ? 'Verify your email'
      : 'Verifying your email';

  const subtitle =
    status === 'success'
      ? 'Your account has been verified successfully.'
      : status === 'error'
      ? 'We could not complete the verification process.'
      : 'Please wait while we verify your account.';

  return (
    <PublicLayout sidebarActive="login">
      <div className="auth-page">
        <section className="auth-stage auth-stage-clean">
          <div className="auth-card login-card-custom">
            <div className="auth-card-header auth-card-header-simple">
              <h1>{heading}</h1>
            </div>

            <p className="auth-subtitle">{subtitle}</p>

            <div className="auth-form">
              <div
                className={
                  status === 'success'
                    ? 'success-banner'
                    : status === 'error'
                    ? 'inline-error centered-text'
                    : 'info-banner'
                }
              >
                {message}
              </div>

              <div className="form-divider" />

              <button
                type="button"
                onClick={() => window.location.replace('/login')}
                className={status === 'error' ? 'primary-button full-width' : 'muted-link'}
                style={
                  status === 'error'
                    ? {}
                    : { background: 'none', border: 'none', cursor: 'pointer' }
                }
              >
                Go to login
              </button>
            </div>
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
