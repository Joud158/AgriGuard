import React from 'react';
import { useEffect, useState } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import FormField from '../components/FormField';
import Toast from '../components/Toast';
import { getTeams, inviteUser } from '../services/authApi';
import { validateInvite } from '../utils/validation';

const initialValues = {
  fullName: '',
  email: '',
  role: '',
  teamId: '',
};

export default function InviteUserPage() {
  const [values, setValues] = useState(initialValues);
  const [teams, setTeams] = useState([]);
  const [loadingTeams, setLoadingTeams] = useState(true);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [messageVariant, setMessageVariant] = useState('success');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadTeams() {
      const response = await getTeams();
      if (!active) return;

      if (!response.success) {
        setMessage(response.message || 'Unable to load teams.');
        setMessageVariant('error');
        setLoadingTeams(false);
        return;
      }

      setTeams(response.data || []);
      setLoadingTeams(false);
    }

    loadTeams().catch(() => {
      if (!active) return;
      setMessage('Unable to load fields right now.');
      setMessageVariant('error');
      setLoadingTeams(false);
    });

    return () => {
      active = false;
    };
  }, []);

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
    setMessage('');
    setMessageVariant('success');
  }

  function handleCancel() {
    setValues(initialValues);
    setErrors({});
    setMessage('');
    setMessageVariant('success');
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const payload = {
      ...values,
      teamId: values.teamId,
    };

    const nextErrors = validateInvite(payload);
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length) return;

    setSubmitting(true);
    setMessage('');

    const response = await inviteUser(payload);
    setSubmitting(false);

    if (!response.success) {
      setErrors(response.errors ?? {});
      setMessage(response.message || 'Invitation failed.');
      setMessageVariant('error');
      return;
    }

    setValues(initialValues);
    setErrors({});

    const delivery = response.data?.emailDelivery;

    if (delivery?.sent) {
      setMessage(`Invitation email sent to ${response.data.invitation.email}.`);
      setMessageVariant('success');
      return;
    }

    setMessage('Invitation was created, but the email could not be delivered automatically. Please check your email settings.');
    setMessageVariant('error');
  }

  const teamSelectDisabled = loadingTeams || !values.role;

  const teamPlaceholder = loadingTeams
    ? 'Loading teams...'
    : !values.role
      ? 'Select role first'
      : teams.length === 0
        ? 'No field assigned'
        : 'No field assigned';

  return (
    <DashboardLayout role="admin">
      <div className="page-head create-user-head">
        <div className="page-head-text">
          <h1>Create user</h1>
          <p>Invite an agronomist or farmer. The farm network keeps one fixed admin account.</p>
        </div>
      </div>

      <div className="form-panel invite-panel">
        <form className="stack-form" onSubmit={handleSubmit}>
          <FormField
            name="fullName"
            placeholder="Full name"
            value={values.fullName}
            onChange={handleChange}
            error={errors.fullName}
          />

          <FormField
            name="email"
            placeholder="Email"
            value={values.email}
            onChange={handleChange}
            error={errors.email}
          />

          <FormField
            name="role"
            error={errors.role}
            children={
              <select
                name="role"
                value={values.role}
                onChange={handleChange}
                className={errors.role ? 'input error' : 'input'}
              >
                <option value="">Role</option>
                <option value="coach">Agronomist</option>
                <option value="player">Farmer</option>
              </select>
            }
          />

          <FormField
            label="Assign Field (Optional)"
            name="teamId"
            error={errors.teamId}
            children={
              <select
                name="teamId"
                value={values.teamId}
                onChange={handleChange}
                className={errors.teamId ? 'input error' : 'input'}
                disabled={teamSelectDisabled}
              >
                <option value="">{teamPlaceholder}</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            }
          />

          <div className="action-row">
            <button type="button" className="secondary-button" onClick={handleCancel}>
              Cancel
            </button>

            <button type="submit" className="primary-button" disabled={submitting || loadingTeams}>
              {submitting ? 'Sending invite...' : 'Invite user'}
            </button>
          </div>
        </form>
      </div>

      <Toast message={message} variant={messageVariant} />
    </DashboardLayout>
  );
}

