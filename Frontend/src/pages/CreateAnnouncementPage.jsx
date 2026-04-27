import React from 'react';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createAnnouncement, getTeams } from '../services/authApi';
import { useAuth } from '../context/AuthContext';
import DashboardLayout from '../layouts/DashboardLayout';
import FormField from '../components/FormField';

const ADMIN_AUDIENCE_OPTIONS = [
  { value: 'all_coaches', label: 'All agronomists' },
  { value: 'all_players', label: 'All farmers' },
  { value: 'all_users', label: 'All users in AgriGuard' },
  { value: 'team_players', label: 'A specific farm/field group' },
];

const COACH_AUDIENCE_OPTIONS = [
  { value: 'team_players', label: 'Farmers of my assigned fields' },
];

export default function CreateAnnouncementPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const role = user?.role || 'admin';
  const [teams, setTeams] = useState([]);
  const [form, setForm] = useState({ title: '', message: '', audienceType: '', teamId: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    getTeams()
      .then((response) => {
        if (!active) return;

        if (!response.success) {
          setError(response.message || 'Unable to load teams.');
          setTeams([]);
          return;
        }

        setTeams(Array.isArray(response.data) ? response.data : []);
      })
      .catch(() => {
        if (!active) return;
        setError('Unable to load teams.');
        setTeams([]);
      });

    return () => {
      active = false;
    };
  }, []);

  const availableTeams =
    role === 'coach'
      ? teams.filter((team) => team.coach_user_id === user?.id)
      : teams;

  const audienceOptions = role === 'admin' ? ADMIN_AUDIENCE_OPTIONS : COACH_AUDIENCE_OPTIONS;
  const effectiveAudienceType = form.audienceType || (role === 'coach' ? 'team_players' : '');
  const requiresTeam = effectiveAudienceType === 'team_players';
  const showAudienceSelector = role === 'admin';

  useEffect(() => {
    if (!requiresTeam) {
      setForm((prev) => (prev.teamId ? { ...prev, teamId: '' } : prev));
      return;
    }

    if (!availableTeams.length) {
      setForm((prev) => (prev.teamId ? { ...prev, teamId: '' } : prev));
      return;
    }

    setForm((prev) => {
      if (availableTeams.some((team) => team.id === prev.teamId)) {
        return prev;
      }

      return {
        ...prev,
        teamId: availableTeams[0].id,
      };
    });
  }, [availableTeams, requiresTeam]);

  function handleChange(e) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.title.trim() || !form.message.trim()) {
      setError('Title and message are required.');
      return;
    }

    if (showAudienceSelector && !form.audienceType) {
      setError('Select who should receive this announcement.');
      return;
    }

    if (requiresTeam && !form.teamId) {
      setError('Select the specific field for this announcement.');
      return;
    }

    setSubmitting(true);
    setError('');

    const response = await createAnnouncement({
      title: form.title.trim(),
      message: form.message.trim(),
      audienceType: effectiveAudienceType,
      teamId: requiresTeam ? form.teamId : '',
    });

    if (!response.success) {
      setError(response.message || 'Unable to send announcement.');
      setSubmitting(false);
      return;
    }

    try {
      navigate('/announcements');
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DashboardLayout role={role}>
      <div>
        <div className="page-head create-user-head">
          <div className="page-head-text">
            <h1>New Announcement</h1>
            <p>Send updates to farmers, agronomists, or a specific farm/field group.</p>
          </div>
        </div>

        <div className="form-panel invite-panel">
          {error && (
            <div className="error-banner" style={{ borderRadius: 14, padding: '12px 16px', marginBottom: 20 }}>
              {error}
            </div>
          )}

          <form className="stack-form" onSubmit={handleSubmit}>
            {showAudienceSelector && (
              <FormField
                name="audienceType"
                children={
                  <select
                    name="audienceType"
                    value={form.audienceType}
                    onChange={handleChange}
                    className="input"
                  >
                    <option value="" disabled>
                      Choose who should receive this announcement
                    </option>
                    {audienceOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                }
              />
            )}

            {requiresTeam && (
              <FormField
                name="teamId"
                children={
                  <select
                    name="teamId"
                    value={form.teamId}
                    onChange={handleChange}
                    className="input"
                  >
                  {!availableTeams.length && <option value="">No eligible fields available</option>}
                  {availableTeams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                  </select>
                }
              />
            )}

            <FormField
              name="title"
              value={form.title}
              onChange={handleChange}
              placeholder="Title"
            />

            <FormField
              name="message"
              error=""
              children={
                <textarea
                  name="message"
                  value={form.message}
                  onChange={handleChange}
                  placeholder="Write your announcement here..."
                  className="input"
                  rows={6}
                  style={{ paddingTop: 16, resize: 'vertical', minHeight: 180 }}
                />
              }
            />

            <div className="action-row">
              <button type="button" className="secondary-button" onClick={() => navigate('/announcements')}>
                Cancel
              </button>
              <button type="submit" className="primary-button" disabled={submitting}>
                {submitting ? 'Sending...' : 'Send Announcement'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </DashboardLayout>
  );
}

