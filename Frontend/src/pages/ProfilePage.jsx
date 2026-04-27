import React from 'react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import DashboardLayout from '../layouts/DashboardLayout';
import { beginMfaSetup, verifyMfaSetup, disableMfa } from '../services/authApi';
import { getRoleLabel } from '../utils/roleHelpers';

function InfoRow({ label, value }) {
  return (
    <div className="profile-row">
      <span className="profile-label">{label}</span>
      <span className="profile-value">{value || '—'}</span>
    </div>
  );
}

export default function ProfilePage() {
  const { user, logout, refreshSession } = useAuth();
  const navigate = useNavigate();

  const [setupState, setSetupState] = useState({
    secret: '',
    otpauthUri: '',
    qrCodeUrl: '',
  });

  const [setupCode, setSetupCode] = useState('');
  const [disableForm, setDisableForm] = useState({ password: '', code: '' });
  const [loadingAction, setLoadingAction] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  function handleLogout() {
    logout();
    navigate('/', { replace: true });
  }

  function clearMessages() {
    setSuccessMessage('');
    setErrorMessage('');
  }

  async function handleBeginMfaSetup() {
    clearMessages();
    setLoadingAction('setup');

    const response = await beginMfaSetup();
    setLoadingAction('');

    if (!response.success) {
      setErrorMessage(response.message || 'Could not start authenticator setup.');
      return;
    }

    setSetupState(response.data || { secret: '', otpauthUri: '', qrCodeUrl: '' });
  }

  async function handleVerifyMfaSetup(event) {
    event.preventDefault();
    clearMessages();
    setLoadingAction('verify-setup');

    const response = await verifyMfaSetup({ code: setupCode });
    setLoadingAction('');

    if (!response.success) {
      setErrorMessage(response.message || 'Could not verify the authenticator code.');
      return;
    }

    setSetupState({ secret: '', otpauthUri: '', qrCodeUrl: '' });
    setSetupCode('');
    setSuccessMessage(response.data?.message || 'Authenticator app MFA enabled successfully.');
    await refreshSession();
  }

  async function handleDisableMfa(event) {
    event.preventDefault();
    clearMessages();
    setLoadingAction('disable');

    const response = await disableMfa(disableForm);
    setLoadingAction('');

    if (!response.success) {
      setErrorMessage(response.message || 'Could not disable authenticator app MFA.');
      return;
    }

    setDisableForm({ password: '', code: '' });
    setSuccessMessage(response.data?.message || 'Authenticator app MFA disabled.');
    await refreshSession();
  }

  return (
    <DashboardLayout role={user?.role || 'player'}>
      <section className="panel profile-panel">
        <div className="profile-header-block">
          <div>
            <p className="eyebrow">My account</p>
            <h1>Profile</h1>
            <p className="muted-copy">
              Review your account details, manage account security, and sign out when needed.
            </p>
          </div>
        </div>

        {successMessage ? <div className="success-banner">{successMessage}</div> : null}
        {errorMessage ? <div className="info-banner error-banner">{errorMessage}</div> : null}

        <div className="profile-card-grid">
          <article className="profile-card">
            <h2>Personal information</h2>

            <InfoRow label="Full name" value={user?.fullName} />
            <InfoRow label="Email" value={user?.email} />
            <InfoRow label="Role" value={getRoleLabel(user?.role)} />

            {user?.role === 'player' ? (
              <InfoRow label="Field" value={user?.team || 'Not assigned yet'} />
            ) : null}

            {user?.role === 'coach' ? (
              <InfoRow label="Fields Covered" value={user?.team || 'No fields assigned yet'} />
            ) : null}
          </article>

          <article className="profile-card">
            <h2>Account details</h2>

            <InfoRow label="Status" value={user?.isActive ? 'Active' : 'Inactive'} />
            <InfoRow label="Farm Network ID" value={user?.clubId || 'Not available'} />
            <InfoRow
              label="Created at"
              value={user?.createdAt ? new Date(user.createdAt).toLocaleString() : ''}
            />
            <InfoRow
              label="Updated at"
              value={user?.updatedAt ? new Date(user.updatedAt).toLocaleString() : ''}
            />
          </article>
        </div>

        <article className="profile-card profile-security-card">
          <h2>Security</h2>

          <InfoRow
            label="Authenticator app MFA"
            value={user?.mfaEnabled ? 'Enabled' : 'Disabled'}
          />

          {!user?.mfaEnabled ? (
            <div className="mfa-section">
              <p className="muted-copy small-copy">
                Add an extra login step with Google Authenticator, Microsoft Authenticator,
                Authy, or another TOTP-compatible app.
              </p>

              {!setupState.secret ? (
                <button
                  type="button"
                  className="primary-button"
                  onClick={handleBeginMfaSetup}
                  disabled={loadingAction === 'setup'}
                >
                  {loadingAction === 'setup' ? 'Preparing...' : 'Set up authenticator app'}
                </button>
              ) : (
                <div className="mfa-setup-box">
                  <p className="muted-copy small-copy">
                    Scan the QR code in your authenticator app. If QR is not available,
                    add the account manually with the secret below.
                  </p>

                  {setupState.qrCodeUrl ? (
                    <img
                      src={setupState.qrCodeUrl}
                      alt="MFA QR code"
                      className="mfa-qr-image"
                    />
                  ) : null}

                  <div className="mfa-secret-block">
                    <span className="profile-label">Manual setup secret</span>
                    <code className="mfa-secret-code">{setupState.secret}</code>
                  </div>

                  <form className="auth-form" onSubmit={handleVerifyMfaSetup}>
                    <input
                      className="input"
                      type="text"
                      placeholder="Enter 6-digit authenticator code"
                      inputMode="numeric"
                      maxLength={6}
                      value={setupCode}
                      onChange={(event) =>
                        setSetupCode(event.target.value.replace(/[^0-9]/g, '').slice(0, 6))
                      }
                    />

                    <div className="mfa-button-row">
                      <button
                        type="submit"
                        className="primary-button"
                        disabled={loadingAction === 'verify-setup'}
                      >
                        {loadingAction === 'verify-setup' ? 'Verifying...' : 'Verify and enable'}
                      </button>

                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => {
                          setSetupState({ secret: '', otpauthUri: '', qrCodeUrl: '' });
                          setSetupCode('');
                          clearMessages();
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          ) : (
            <form className="auth-form mfa-disable-form" onSubmit={handleDisableMfa}>
              <p className="muted-copy small-copy">
                To disable MFA, confirm your current password and enter a fresh code from
                your authenticator app.
              </p>

              <input
                className="input"
                type="password"
                placeholder="Current password"
                value={disableForm.password}
                onChange={(event) =>
                  setDisableForm((current) => ({
                    ...current,
                    password: event.target.value,
                  }))
                }
              />

              <input
                className="input"
                type="text"
                placeholder="Current 6-digit authenticator code"
                inputMode="numeric"
                maxLength={6}
                value={disableForm.code}
                onChange={(event) =>
                  setDisableForm((current) => ({
                    ...current,
                    code: event.target.value.replace(/[^0-9]/g, '').slice(0, 6),
                  }))
                }
              />

              <button
                type="submit"
                className="secondary-button"
                disabled={loadingAction === 'disable'}
              >
                {loadingAction === 'disable' ? 'Disabling...' : 'Disable MFA'}
              </button>
            </form>
          )}
        </article>

        <div className="profile-actions">
          <button type="button" className="secondary-button" onClick={() => navigate(-1)}>
            Go back
          </button>

          <button type="button" className="primary-button" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </section>
    </DashboardLayout>
  );
}