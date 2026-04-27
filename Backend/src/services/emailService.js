const env = require('../config/env');
const { logError, logInfo, logWarn } = require('../utils/logger');
const smtpEmailProvider = require('./emailProviders/smtpEmailProvider');
const stubEmailProvider = require('./emailProviders/stubEmailProvider');

const BRAND_PRIMARY = '#14532d';
const BRAND_DARK = '#064e3b';
const BRAND_SOFT = '#dcfce7';
const TEXT_PRIMARY = '#14213d';
const TEXT_MUTED = '#6b7280';
const CARD_BORDER = '#bbf7d0';

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getEmailProvider() {
  if (env.emailProvider === 'stub') {
    return stubEmailProvider;
  }

  return smtpEmailProvider;
}

function getRoleLabel(role) {
  if (role === 'coach') return 'Agronomist';
  if (role === 'player') return 'Farmer';
  if (role === 'admin') return 'Administrator';
  return role;
}

function renderEmailShell(title, body) {
  return `
    <div style="background:#f7fbf8;padding:28px 14px;font-family:Arial,sans-serif;">
      <div style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid ${CARD_BORDER};border-radius:18px;padding:28px;color:${TEXT_PRIMARY};line-height:1.6;">
        <div style="margin-bottom:22px;">
          <div style="display:inline-block;background:${BRAND_SOFT};color:${BRAND_DARK};font-weight:800;padding:8px 12px;border-radius:999px;font-size:13px;">
            AgriGuard
          </div>
        </div>

        <h2 style="margin:0 0 16px;color:${BRAND_DARK};font-size:24px;line-height:1.25;">
          ${title}
        </h2>

        ${body}
      </div>
    </div>
  `;
}

function renderButton(href, label) {
  return `
    <a href="${href}" style="background:${BRAND_PRIMARY};color:#ffffff;text-decoration:none;padding:13px 22px;border-radius:10px;display:inline-block;font-weight:700;">
      ${label}
    </a>
  `;
}

function buildInvitationText({ fullName, inviterName, clubName, role, team, inviteLink, expiresAt }) {
  const greetingName = fullName || 'there';
  const roleLabel = getRoleLabel(role);

  return [
    `Hello ${greetingName},`,
    '',
    `${inviterName} invited you to join ${clubName} on AgriGuard as a ${roleLabel}.`,
    team ? `Farm / field group: ${team}` : '',
    `Accept your invitation here: ${inviteLink}`,
    `This invitation expires on: ${expiresAt}`,
    '',
    'If you were not expecting this email, you can safely ignore it.',
  ]
    .filter(Boolean)
    .join('\n');
}

function buildInvitationHtml({ fullName, inviterName, clubName, role, team, inviteLink, expiresAt }) {
  const greetingName = escapeHtml(fullName || 'there');
  const safeInviter = escapeHtml(inviterName);
  const safeClub = escapeHtml(clubName);
  const safeRole = escapeHtml(getRoleLabel(role));
  const safeTeam = team
    ? `<p style="margin:0 0 12px;">Farm / field group: <strong>${escapeHtml(team)}</strong></p>`
    : '';
  const safeExpiresAt = escapeHtml(expiresAt);
  const safeInviteLink = escapeHtml(inviteLink);

  return renderEmailShell(
    "You're invited to join AgriGuard",
    `
      <p style="margin:0 0 12px;">Hello ${greetingName},</p>
      <p style="margin:0 0 12px;">
        <strong>${safeInviter}</strong> invited you to join <strong>${safeClub}</strong> on AgriGuard as a <strong>${safeRole}</strong>.
      </p>
      ${safeTeam}

      <p style="margin:24px 0;">
        ${renderButton(safeInviteLink, 'Accept invitation')}
      </p>

      <p style="margin:0 0 12px;">This invitation expires on <strong>${safeExpiresAt}</strong>.</p>
      <p style="margin:0;color:${TEXT_MUTED};">If you were not expecting this email, you can safely ignore it.</p>
    `
  );
}

function buildPasswordResetText({ fullName, resetLink, expiresAt }) {
  const greetingName = fullName || 'there';

  return [
    `Hello ${greetingName},`,
    '',
    'We received a request to reset your AgriGuard password.',
    `Reset your password here: ${resetLink}`,
    `This link expires on: ${expiresAt}`,
    '',
    'If you did not request a password reset, you can safely ignore this email.',
  ].join('\n');
}

function buildPasswordResetHtml({ fullName, resetLink, expiresAt }) {
  const greetingName = escapeHtml(fullName || 'there');
  const safeResetLink = escapeHtml(resetLink);
  const safeExpiresAt = escapeHtml(expiresAt);

  return renderEmailShell(
    'Reset your AgriGuard password',
    `
      <p style="margin:0 0 12px;">Hello ${greetingName},</p>
      <p style="margin:0 0 12px;">We received a request to reset your AgriGuard password.</p>

      <p style="margin:24px 0;">
        ${renderButton(safeResetLink, 'Reset password')}
      </p>

      <p style="margin:0 0 12px;">This link expires on <strong>${safeExpiresAt}</strong>.</p>
      <p style="margin:0;color:${TEXT_MUTED};">If you did not request a password reset, you can safely ignore this email.</p>
    `
  );
}

function buildVerifyAdminText({ fullName, clubName, verifyLink, expiresAt }) {
  const greetingName = fullName || 'there';

  return [
    `Hello ${greetingName},`,
    '',
    `Welcome to AgriGuard for ${clubName}.`,
    'Please verify your email address to activate your administrator account.',
    `Verify your account here: ${verifyLink}`,
    `This link expires on: ${expiresAt}`,
    '',
    'If you did not create this account, you can safely ignore this email.',
  ].join('\n');
}

function buildVerifyAdminHtml({ fullName, clubName, verifyLink, expiresAt }) {
  const greetingName = escapeHtml(fullName || 'there');
  const safeClubName = escapeHtml(clubName);
  const safeVerifyLink = escapeHtml(verifyLink);
  const safeExpiresAt = escapeHtml(expiresAt);

  return renderEmailShell(
    'Verify your AgriGuard administrator account',
    `
      <p style="margin:0 0 12px;">Hello ${greetingName},</p>
      <p style="margin:0 0 12px;">Welcome to <strong>${safeClubName}</strong> on AgriGuard.</p>
      <p style="margin:0 0 12px;">Please verify your email address to activate your administrator account.</p>

      <p style="margin:24px 0;">
        ${renderButton(safeVerifyLink, 'Verify my account')}
      </p>

      <p style="margin:0 0 12px;">This link expires on <strong>${safeExpiresAt}</strong>.</p>
      <p style="margin:0;color:${TEXT_MUTED};">If you did not create this account, you can safely ignore it.</p>
    `
  );
}

function buildScheduleNotificationText({ recipientName, eventTitle, eventType, teamName, action, startTime, endTime, location }) {
  const greetingName = recipientName || 'there';
  const verb =
    action === 'updated' ? 'updated' : action === 'cancelled' ? 'cancelled' : 'scheduled';

  return [
    `Hello ${greetingName},`,
    '',
    `${eventTitle} (${eventType}) was ${verb} for ${teamName}.`,
    startTime ? `Start time: ${startTime}` : '',
    endTime ? `End time: ${endTime}` : '',
    location ? `Location: ${location}` : '',
    '',
    'This is a calendar update from AgriGuard.',
  ]
    .filter(Boolean)
    .join('\n');
}

function buildScheduleNotificationHtml({ recipientName, eventTitle, eventType, teamName, action, startTime, endTime, location }) {
  const greetingName = escapeHtml(recipientName || 'there');
  const safeTitle = escapeHtml(eventTitle);
  const safeType = escapeHtml(eventType);
  const safeTeam = escapeHtml(teamName);
  const verb =
    action === 'updated' ? 'updated' : action === 'cancelled' ? 'cancelled' : 'scheduled';

  return renderEmailShell(
    'AgriGuard Calendar Notification',
    `
      <p style="margin:0 0 12px;">Hello ${greetingName},</p>
      <p style="margin:0 0 12px;">
        <strong>${safeTitle}</strong> (${safeType}) was ${verb} for <strong>${safeTeam}</strong>.
      </p>
      ${startTime ? `<p style="margin:0 0 8px;">Start time: <strong>${escapeHtml(startTime)}</strong></p>` : ''}
      ${endTime ? `<p style="margin:0 0 8px;">End time: <strong>${escapeHtml(endTime)}</strong></p>` : ''}
      ${location ? `<p style="margin:0 0 8px;">Location: <strong>${escapeHtml(location)}</strong></p>` : ''}
      <p style="margin:16px 0 0;color:${TEXT_MUTED};">This is a calendar update from AgriGuard.</p>
    `
  );
}

function buildAnnouncementSnippet(message) {
  const text = String(message || '').trim();
  if (!text) return 'Open AgriGuard to read the latest announcement.';
  if (text.length <= 180) return text;
  return `${text.slice(0, 180).trimEnd()}...`;
}

function buildAnnouncementLink(announcementId) {
  const baseUrl = env.frontendBaseUrl || 'http://localhost:5173';
  return `${baseUrl}/announcements?announcementId=${encodeURIComponent(announcementId)}`;
}

function buildAnnouncementNotificationText({ recipientName, announcementId, announcementTitle, announcementMessage, teamName }) {
  const greetingName = recipientName || 'there';
  const announcementLink = buildAnnouncementLink(announcementId);

  return [
    `Hello ${greetingName},`,
    '',
    `A new announcement was posted for ${teamName}.`,
    `Title: ${announcementTitle}`,
    `Preview: ${buildAnnouncementSnippet(announcementMessage)}`,
    `Open the announcements tab here: ${announcementLink}`,
    '',
    'This is an update from AgriGuard.',
  ].join('\n');
}

function buildAnnouncementNotificationHtml({ recipientName, announcementId, announcementTitle, announcementMessage, teamName }) {
  const greetingName = escapeHtml(recipientName || 'there');
  const safeTitle = escapeHtml(announcementTitle);
  const safeTeam = escapeHtml(teamName);
  const safeSnippet = escapeHtml(buildAnnouncementSnippet(announcementMessage));
  const announcementLink = escapeHtml(buildAnnouncementLink(announcementId));

  return renderEmailShell(
    'New AgriGuard Announcement',
    `
      <p style="margin:0 0 12px;">Hello ${greetingName},</p>
      <p style="margin:0 0 12px;">A new announcement was posted for <strong>${safeTeam}</strong>.</p>
      <p style="margin:0 0 8px;">Title: <strong>${safeTitle}</strong></p>
      <p style="margin:0 0 16px;">Preview: ${safeSnippet}</p>

      <p style="margin:24px 0;">
        ${renderButton(announcementLink, 'Open announcements')}
      </p>

      <p style="margin:0;color:${TEXT_MUTED};">This is an update from AgriGuard.</p>
    `
  );
}

async function sendEmail(message, logContext) {
  if (!env.emailEnabled) {
    logWarn('Email skipped because EMAIL_ENABLED is false.', logContext);
    return {
      sent: false,
      skipped: true,
      provider: env.emailProvider,
      reason: 'Email delivery is disabled in the backend environment.',
    };
  }

  try {
    const provider = getEmailProvider();
    const result = await provider.send(message, logContext);

    if (result.sent) {
      logInfo('Email sent', {
        ...logContext,
        provider: result.provider,
        messageId: result.messageId,
        accepted: result.accepted,
        rejected: result.rejected,
      });
    } else {
      logInfo('Email skipped', {
        ...logContext,
        provider: result.provider,
        reason: result.reason,
      });
    }

    return result;
  } catch (error) {
    logError('Email failed', {
      ...logContext,
      error: error.message,
      provider: env.emailProvider,
    });

    return {
      sent: false,
      skipped: false,
      provider: env.emailProvider,
      reason: error.message,
    };
  }
}

async function sendInvitationEmail(payload) {
  return sendEmail(
    {
      to: payload.to,
      subject: `You're invited to join ${payload.clubName} on AgriGuard`,
      text: buildInvitationText(payload),
      html: buildInvitationHtml(payload),
    },
    { kind: 'invitation', to: payload.to }
  );
}

async function sendPasswordResetEmail(payload) {
  return sendEmail(
    {
      to: payload.to,
      subject: 'Reset your AgriGuard password',
      text: buildPasswordResetText(payload),
      html: buildPasswordResetHtml(payload),
    },
    { kind: 'password-reset', to: payload.to }
  );
}

async function sendAdminVerificationEmail(payload) {
  return sendEmail(
    {
      to: payload.to,
      subject: 'Verify your AgriGuard administrator account',
      text: buildVerifyAdminText(payload),
      html: buildVerifyAdminHtml(payload),
    },
    { kind: 'admin-verification', to: payload.to }
  );
}

async function sendScheduleNotificationEmail(payload) {
  return sendEmail(
    {
      to: payload.to,
      subject: `AgriGuard calendar ${
        payload.action === 'updated'
          ? 'update'
          : payload.action === 'cancelled'
            ? 'cancellation'
            : 'notification'
      }: ${payload.eventTitle}`,
      text: buildScheduleNotificationText(payload),
      html: buildScheduleNotificationHtml(payload),
    },
    {
      kind: 'schedule-notification',
      to: payload.to,
      action: payload.action,
      eventId: payload.eventId,
    }
  );
}

async function sendScheduleNotificationEmails(dispatches) {
  const deliveries = await Promise.all(
    dispatches.map(async (dispatch) => {
      const delivery = await sendScheduleNotificationEmail(dispatch);

      return {
        to: dispatch.to,
        eventId: dispatch.eventId,
        delivery,
      };
    })
  );

  return deliveries;
}

async function sendAnnouncementNotificationEmail(payload) {
  return sendEmail(
    {
      to: payload.to,
      subject: `New announcement: ${payload.announcementTitle}`,
      text: buildAnnouncementNotificationText(payload),
      html: buildAnnouncementNotificationHtml(payload),
    },
    {
      kind: 'announcement-notification',
      to: payload.to,
      announcementId: payload.announcementId,
    }
  );
}

async function sendAnnouncementNotificationEmails(dispatches) {
  const deliveries = await Promise.all(
    dispatches.map(async (dispatch) => {
      const delivery = await sendAnnouncementNotificationEmail(dispatch);

      return {
        to: dispatch.to,
        announcementId: dispatch.announcementId,
        delivery,
      };
    })
  );

  return deliveries;
}

module.exports = {
  sendInvitationEmail,
  sendPasswordResetEmail,
  sendAdminVerificationEmail,
  sendScheduleNotificationEmail,
  sendScheduleNotificationEmails,
  sendAnnouncementNotificationEmail,
  sendAnnouncementNotificationEmails,
};