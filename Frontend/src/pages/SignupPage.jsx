import React from 'react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import PublicLayout from '../layouts/PublicLayout';
import farmerImage from '../assets/farmer.png';

import { useAuth } from '../context/AuthContext';
import { validateAdminSignup } from '../utils/validation';

const initialValues = {
  fullName: '',
  email: '',
  password: '',
  confirmPassword: '',
  clubName: '',
  city: '',
};

export default function SignupPage() {
  const { registerAdmin, loading } = useAuth();

  const [form, setForm] = useState(initialValues);
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

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
    setSuccessMessage('');
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const nextErrors = validateAdminSignup(form);
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length) {
      return;
    }

    const response = await registerAdmin(form);

    if (!response.success) {
      setErrors(response.errors ?? {});
      setServerError(response.message || 'Sign up failed.');
      return;
    }

    setForm(initialValues);
    setErrors({});
    setServerError('');
    setSuccessMessage(
      response.data?.message ||
        'Your administrator account was created. Please verify your email before signing in.'
    );
  }

  return (
    <PublicLayout sidebarActive="signup">
      <div className="auth-page">
        <section className="auth-stage auth-stage-clean">
          <div className="auth-card signup-card">
            <div className="auth-card-header auth-card-header-simple">
              <h1>Sign up to AgriGuard</h1>
            </div>

            <p className="auth-subtitle">
              Create the main farm network administrator account and register
              your crop monitoring network.
            </p>

            <form className="auth-form grouped-form" onSubmit={handleSubmit}>
              <div>
                <h3 className="group-title">Personal Information</h3>

                <div className="form-field">
                  <input
                    className={errors.fullName ? 'input error' : 'input'}
                    type="text"
                    name="fullName"
                    placeholder="Full name"
                    value={form.fullName}
                    onChange={handleChange}
                  />
                  {errors.fullName ? (
                    <div className="inline-error">{errors.fullName}</div>
                  ) : null}
                </div>

                <div className="form-field">
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
                </div>

                <div className="form-field">
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
                </div>

                <div className="form-field">
                  <input
                    className={errors.confirmPassword ? 'input error' : 'input'}
                    type="password"
                    name="confirmPassword"
                    placeholder="Confirm password"
                    value={form.confirmPassword}
                    onChange={handleChange}
                  />
                  {errors.confirmPassword ? (
                    <div className="inline-error">
                      {errors.confirmPassword}
                    </div>
                  ) : null}
                </div>
              </div>

              <div>
                <h3 className="group-title">Farm Network Information</h3>

                <div className="form-field">
                  <input
                    className={errors.clubName ? 'input error' : 'input'}
                    type="text"
                    name="clubName"
                    placeholder="Farm network name"
                    value={form.clubName}
                    onChange={handleChange}
                  />
                  {errors.clubName ? (
                    <div className="inline-error">{errors.clubName}</div>
                  ) : null}
                </div>

                <div className="form-field">
                  <input
                    className={errors.city ? 'input error' : 'input'}
                    type="text"
                    name="city"
                    placeholder="City / Location"
                    value={form.city}
                    onChange={handleChange}
                  />
                  {errors.city ? (
                    <div className="inline-error">{errors.city}</div>
                  ) : null}
                </div>
              </div>

              {serverError ? (
                <div className="inline-error">{serverError}</div>
              ) : null}

              {successMessage ? (
                <div className="success-banner">
                  {successMessage}

                  <div className="forgot-password-row">
                    <Link to="/login" className="muted-link">
                      Back to login
                    </Link>
                  </div>
                </div>
              ) : null}

              <button
                type="submit"
                className="primary-button full-width"
                disabled={loading}
              >
                {loading ? 'Creating account...' : 'Sign up'}
              </button>
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
