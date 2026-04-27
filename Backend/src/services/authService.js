const { randomUUID } = require('crypto');
const env = require('../config/env');
const { readDb, updateDb } = require('../data/store');
const { hashPassword, verifyPassword } = require('../utils/passwords');
const {
  createAccessToken,
  createScopedToken,
  verifyScopedToken,
  createRawInvitationToken,
  createRawPasswordResetToken,
  createRawEmailVerificationToken,
  hashInvitationToken,
  hashPasswordResetToken,
  hashEmailVerificationToken,
} = require('../utils/tokens');
const { generateBase32Secret, verifyTotp, buildOtpAuthUrl } = require('../utils/totp');
const { encryptText, decryptText } = require('../utils/cryptoText');
const httpError = require('../utils/httpError');
const { logInfo } = require('../utils/logger');
const { sendInvitationEmail, sendPasswordResetEmail, sendAdminVerificationEmail } = require('./emailService');
const {
  ensureAuditCollections,
  buildAdminAuditView,
  buildMyHistoryView,
  logAuditEvent,
  logRoleChange,
  logTeamAssignmentChange,
} = require('./auditService');

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

function normalizeCode(code) {
  return String(code || '').replace(/\s+/g, '');
}

function ensureClubCollections(db) {
  if (!Array.isArray(db.teams)) db.teams = [];
  if (!Array.isArray(db.players)) db.players = [];
  if (!Array.isArray(db.team_memberships)) db.team_memberships = [];
  if (!Array.isArray(db.player_attributes)) db.player_attributes = [];
  if (!Array.isArray(db.notifications)) db.notifications = [];
  if (!Array.isArray(db.event_requests)) db.event_requests = [];
  if (!Array.isArray(db.event_request_revisions)) db.event_request_revisions = [];
  if (!Array.isArray(db.invitations)) db.invitations = [];
  if (!Array.isArray(db.users)) db.users = [];
  if (!Array.isArray(db.password_reset_tokens)) db.password_reset_tokens = [];
  if (!Array.isArray(db.email_verification_tokens)) db.email_verification_tokens = [];
  ensureAuditCollections(db);
}

function ensureUserSecurityDefaults(user) {
  if (typeof user.mfa_enabled !== 'boolean') user.mfa_enabled = false;
  if (!('mfa_secret_encrypted' in user)) user.mfa_secret_encrypted = '';
  if (!('mfa_pending_secret_encrypted' in user)) user.mfa_pending_secret_encrypted = '';
  if (!('last_login_at' in user)) user.last_login_at = null;
}

function getTeamInClub(db, clubId, teamId) {
  if (!teamId) return null;
  return db.teams.find((entry) => entry.id === teamId && entry.club_id === clubId) || null;
}

function resolveTeamSelection(db, clubId, teamId) {
  if (!teamId) return null;

  const selected = getTeamInClub(db, clubId, teamId);
  if (!selected) {
    throw httpError(404, 'Selected team not found.', {
      errors: { teamId: 'Selected team not found.' },
    });
  }

  return selected;
}

function getInvitationTeamOrThrow(db, clubId, teamId) {
  if (!teamId) {
    return null;
  }

  const team = getTeamInClub(db, clubId, teamId);
  if (!team) {
    throw httpError(404, 'Selected team not found.');
  }

  return team;
}

function findPlayerRecordByUserId(db, clubId, userId) {
  return db.players.find((entry) => entry.club_id === clubId && entry.user_id === userId) || null;
}

function findMembershipByPlayerId(db, playerId) {
  return db.team_memberships.find((entry) => entry.player_id === playerId) || null;
}

function clearCoachAssignmentsForUser(db, clubId, userId) {
  const now = new Date().toISOString();
  db.teams.forEach((team) => {
    if (team.club_id === clubId && team.coach_user_id === userId) {
      team.coach_user_id = null;
      team.updated_at = now;
    }
  });
}

function clearPlayerMembershipForUser(db, clubId, userId) {
  const playerRecord = findPlayerRecordByUserId(db, clubId, userId);
  if (!playerRecord) {
    return null;
  }

  const membership = findMembershipByPlayerId(db, playerRecord.id);
  if (!membership) {
    return playerRecord;
  }

  db.team_memberships = db.team_memberships.filter((entry) => entry.id !== membership.id);
  return playerRecord;
}

function ensurePlayerRecord(db, clubId, userId) {
  const existingPlayer = findPlayerRecordByUserId(db, clubId, userId);
  if (existingPlayer) {
    return existingPlayer;
  }

  const now = new Date().toISOString();
  const player = {
    id: `player-${randomUUID()}`,
    user_id: userId,
    club_id: clubId,
    jersey_number: null,
    preferred_position: '',
    created_at: now,
    updated_at: now,
  };

  db.players.push(player);
  return player;
}

function listCoachedTeams(db, clubId, userId) {
  return db.teams
    .filter((entry) => entry.club_id === clubId && entry.coach_user_id === userId)
    .sort((left, right) => left.name.localeCompare(right.name));
}

function formatCoachedTeamNames(teams) {
  return teams.map((team) => team.name).join(', ');
}

function resolveUserTeamName(db, user) {
  ensureUserSecurityDefaults(user);

  if (!db) {
    return user.assigned_team || '';
  }

  ensureClubCollections(db);

  if (user.role === 'coach') {
    return formatCoachedTeamNames(listCoachedTeams(db, user.club_id, user.id));
  }

  if (user.role === 'player') {
    const playerRecord = findPlayerRecordByUserId(db, user.club_id, user.id);
    if (playerRecord) {
      const membership = findMembershipByPlayerId(db, playerRecord.id);
      if (membership) {
        const team = getTeamInClub(db, user.club_id, membership.team_id);
        if (team) {
          return team.name;
        }
      }
    }

    return '';
  }

  return user.assigned_team || '';
}


function getUserTeamState(db, user, roleOverride = user.role) {
  ensureClubCollections(db);

  if (roleOverride === 'coach') {
    const coachedTeams = listCoachedTeams(db, user.club_id, user.id);
    return {
      teamId: coachedTeams.length === 1 ? coachedTeams[0].id : '',
      teamName: formatCoachedTeamNames(coachedTeams),
    };
  }

  if (roleOverride === 'player') {
    const playerRecord = findPlayerRecordByUserId(db, user.club_id, user.id);
    if (playerRecord) {
      const membership = findMembershipByPlayerId(db, playerRecord.id);
      if (membership) {
        const team = getTeamInClub(db, user.club_id, membership.team_id);
        if (team) {
          return {
            teamId: team.id,
            teamName: team.name,
          };
        }
      }
    }
  }

  return {
    teamId: '',
    teamName: roleOverride === 'admin' ? '' : user.assigned_team || '',
  };
}

function sanitizeUser(user, db = null) {
  ensureUserSecurityDefaults(user);

  return {
    id: user.id,
    fullName: user.full_name,
    email: user.email,
    role: user.role,
    clubId: user.club_id || null,
    team: resolveUserTeamName(db, user),
    isActive: user.is_active,
    status: user.is_active ? 'active' : 'inactive',
    emailVerifiedAt: user.email_verified_at || null,
    mfaEnabled: Boolean(user.mfa_enabled && user.mfa_secret_encrypted),
    lastLoginAt: user.last_login_at || null,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
  };
}

function sanitizeInvitation(invitation) {
  return {
    id: invitation.id,
    email: invitation.email,
    fullName: invitation.invited_full_name || '',
    role: invitation.role,
    teamId: invitation.team_id || '',
    team: invitation.team_name || '',
    expiresAt: invitation.expires_at,
    acceptedAt: invitation.accepted_at,
    createdAt: invitation.created_at,
  };
}

function syncUserTeamAssignment(db, user, nextRole, teamId) {
  const selectedTeam = resolveTeamSelection(db, user.club_id, teamId || '');
  const wasCoach = user.role === 'coach';

  if (wasCoach && nextRole !== 'coach') {
    clearCoachAssignmentsForUser(db, user.club_id, user.id);
  }

  if (nextRole !== 'player') {
    clearPlayerMembershipForUser(db, user.club_id, user.id);
  }

  if (nextRole === 'admin') {
    if (selectedTeam) {
      throw httpError(400, 'Admin users cannot be linked to a team.', {
        errors: { teamId: 'Admin users cannot be linked to a team.' },
      });
    }

    return '';
  }

  if (nextRole === 'player' && !selectedTeam) {
    clearPlayerMembershipForUser(db, user.club_id, user.id);
    return '';
  }

  if (nextRole === 'coach') {
    if (!selectedTeam) {
      return resolveUserTeamName(db, {
        ...user,
        role: 'coach',
      });
    }

    if (selectedTeam.coach_user_id && selectedTeam.coach_user_id !== user.id) {
      throw httpError(409, 'This team already has a coach assigned.', {
        errors: { teamId: 'This team already has a coach assigned.' },
      });
    }

    selectedTeam.coach_user_id = user.id;
    selectedTeam.updated_at = new Date().toISOString();
    return formatCoachedTeamNames(listCoachedTeams(db, user.club_id, user.id));
  }

  const playerRecord = ensurePlayerRecord(db, user.club_id, user.id);
  const existingMembership = findMembershipByPlayerId(db, playerRecord.id);

  if (existingMembership) {
    existingMembership.team_id = selectedTeam.id;
    return selectedTeam.name;
  }

  db.team_memberships.push({
    id: `membership-${randomUUID()}`,
    team_id: selectedTeam.id,
    player_id: playerRecord.id,
    created_at: new Date().toISOString(),
  });

  return selectedTeam.name;
}

function buildSessionResponse(user, db = null) {
  return {
    token: createAccessToken(user),
    user: sanitizeUser(user, db),
  };
}

function buildMfaProvisioningResponse(user, secret) {
  const otpauthUri = buildOtpAuthUrl({
    issuer: env.mfaIssuer,
    accountName: user.email,
    secret,
  });

  return {
    secret,
    otpauthUri,
    qrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(otpauthUri)}`,
  };
}

async function registerAdmin(payload) {
  const email = normalizeEmail(payload.email);

  return updateDb(async (db) => {
    ensureClubCollections(db);
    const existingUser = db.users.find((entry) => entry.email === email);
    if (existingUser) {
      throw httpError(409, 'An account with this email already exists.', {
        errors: { email: 'Email is already in use.' },
      });
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const club = {
      id: `club-${randomUUID()}`,
      name: payload.clubName.trim(),
      city: payload.city.trim(),
      created_at: nowIso,
      updated_at: nowIso,
    };

    const user = {
      id: `user-${randomUUID()}`,
      full_name: payload.fullName.trim(),
      email,
      password_hash: await hashPassword(payload.password),
      role: 'admin',
      club_id: club.id,
      assigned_team: '',
      is_active: false,
      email_verified_at: null,
      mfa_enabled: false,
      mfa_secret_encrypted: '',
      mfa_pending_secret_encrypted: '',
      last_login_at: null,
      created_at: nowIso,
      updated_at: nowIso,
    };

    db.clubs.unshift(club);
    db.users.unshift(user);

    logRoleChange(db, {
      clubId: club.id,
      userId: user.id,
      oldRole: null,
      newRole: 'admin',
      changedByUserId: user.id,
      reason: 'Initial administrator registration',
      changedAt: nowIso,
    });
    logAuditEvent(db, {
      clubId: club.id,
      actorUserId: user.id,
      targetUserId: user.id,
      entityType: 'user',
      entityId: user.id,
      actionType: 'user_registered',
      summary: `${user.full_name} registered as club administrator.`,
      metadata: { role: 'admin', status: 'pending_verification' },
      createdAt: nowIso,
    });

    const rawToken = createRawEmailVerificationToken();
    const expiresAt = new Date(now.getTime() + env.emailVerificationTtlHours * 60 * 60 * 1000).toISOString();

    db.email_verification_tokens = db.email_verification_tokens.filter((entry) => entry.user_id !== user.id);
    db.email_verification_tokens.unshift({
      id: `emailverify-${randomUUID()}`,
      user_id: user.id,
      token_hash: hashEmailVerificationToken(rawToken),
      expires_at: expiresAt,
      used_at: null,
      created_at: nowIso,
    });

    const verifyLink = `${env.frontendBaseUrl.replace(/\/$/, '')}/verify-email/${rawToken}`;
    const emailDelivery = await sendAdminVerificationEmail({
      to: user.email,
      fullName: user.full_name,
      clubName: club.name,
      verifyLink,
      expiresAt,
    });

    if (!env.emailEnabled) {
      user.is_active = true;
      user.email_verified_at = nowIso;
      user.updated_at = nowIso;

      db.email_verification_tokens = db.email_verification_tokens.map((entry) => {
        if (entry.user_id === user.id) {
          return {
            ...entry,
            used_at: nowIso,
          };
        }
        return entry;
      });

      logInfo('Admin account created with email-disabled fallback session', {
        email: user.email,
      });

      return buildSessionResponse(user, db);
    }

    logInfo('Admin account created pending verification', {
      email: user.email,
      emailSent: emailDelivery.sent,
    });

    return {
      message: emailDelivery.sent
        ? 'Administrator account created. Please check your email to verify your account before signing in.'
        : 'Administrator account created, but the verification email could not be sent. Please review your email settings and try again.',
      emailDelivery,
    };
  });
}

async function verifyAdminEmail(rawToken) {
  return updateDb(async (db) => {
    ensureClubCollections(db);
    const tokenHash = hashEmailVerificationToken(rawToken);
    const tokenEntry = db.email_verification_tokens.find((entry) => entry.token_hash === tokenHash);

    if (!tokenEntry || tokenEntry.used_at) {
      throw httpError(400, 'This verification link is invalid or has already been used.');
    }

    if (new Date(tokenEntry.expires_at) <= new Date()) {
      throw httpError(400, 'This verification link has expired. Please sign up again or request a new verification email.');
    }

    const user = db.users.find((entry) => entry.id === tokenEntry.user_id);
    if (!user) {
      throw httpError(404, 'User not found.');
    }

    const nowIso = new Date().toISOString();
    user.is_active = true;
    user.email_verified_at = nowIso;
    user.updated_at = nowIso;
    tokenEntry.used_at = nowIso;

    logAuditEvent(db, {
      clubId: user.club_id,
      actorUserId: user.id,
      targetUserId: user.id,
      entityType: 'user',
      entityId: user.id,
      actionType: 'user_activated',
      summary: `${user.full_name} verified the administrator account.`,
      metadata: { source: 'email_verification' },
      createdAt: nowIso,
    });

    return {
      message: 'Your administrator account has been verified successfully. You can now sign in.',
    };
  });
}

async function login(payload) {
  const db = await readDb();
  ensureClubCollections(db);
  const email = normalizeEmail(payload.email);
  const user = db.users.find((entry) => entry.email === email);

  if (!user) {
    throw httpError(401, 'Wrong email or password. Try again.');
  }

  ensureUserSecurityDefaults(user);

  const matches = await verifyPassword(payload.password, user.password_hash);
  if (!matches) {
    throw httpError(401, 'Wrong email or password. Try again.');
  }

  if (!user.is_active) {
    throw httpError(
      403,
      user.email_verified_at
        ? 'This account is inactive. Contact your club administrator.'
        : 'Please verify your email address before signing in.'
    );
  }

  if (user.mfa_enabled && user.mfa_secret_encrypted) {
    return {
      mfaRequired: true,
      challengeToken: createScopedToken(
        user.id,
        'login-mfa',
        `${env.mfaChallengeTtlMinutes}m`,
        { email: user.email }
      ),
      user: {
        email: user.email,
        fullName: user.full_name,
      },
    };
  }

  return updateDb(async (mutableDb) => {
    ensureClubCollections(mutableDb);
    const mutableUser = mutableDb.users.find((entry) => entry.id === user.id);
    if (!mutableUser) {
      throw httpError(404, 'User not found.');
    }

    const nowIso = new Date().toISOString();
    mutableUser.last_login_at = nowIso;
    mutableUser.updated_at = nowIso;

    logAuditEvent(mutableDb, {
      clubId: mutableUser.club_id,
      actorUserId: mutableUser.id,
      targetUserId: mutableUser.id,
      entityType: 'auth',
      entityId: mutableUser.id,
      actionType: 'login_success',
      summary: `${mutableUser.full_name} signed in successfully.`,
      metadata: { method: 'password' },
      createdAt: nowIso,
    });

    return buildSessionResponse(mutableUser, mutableDb);
  });
}

async function verifyLoginMfa(payload) {
  const challenge = verifyScopedToken(payload.challengeToken, 'login-mfa');
  const db = await readDb();
  ensureClubCollections(db);
  const user = db.users.find((entry) => entry.id === challenge.sub && entry.is_active);

  if (!user) {
    throw httpError(401, 'This login session is no longer valid. Please sign in again.');
  }

  ensureUserSecurityDefaults(user);

  if (!user.mfa_enabled || !user.mfa_secret_encrypted) {
    throw httpError(400, 'Authenticator app verification is not enabled for this account.');
  }

  const secret = decryptText(user.mfa_secret_encrypted);
  const isValid = verifyTotp(normalizeCode(payload.code), secret, { window: 1 });

  if (!isValid) {
    throw httpError(401, 'The authenticator code is invalid or expired.');
  }

  return updateDb(async (mutableDb) => {
    ensureClubCollections(mutableDb);
    const mutableUser = mutableDb.users.find((entry) => entry.id === user.id && entry.is_active);
    if (!mutableUser) {
      throw httpError(401, 'This login session is no longer valid. Please sign in again.');
    }

    const nowIso = new Date().toISOString();
    mutableUser.last_login_at = nowIso;
    mutableUser.updated_at = nowIso;

    logAuditEvent(mutableDb, {
      clubId: mutableUser.club_id,
      actorUserId: mutableUser.id,
      targetUserId: mutableUser.id,
      entityType: 'auth',
      entityId: mutableUser.id,
      actionType: 'login_success_mfa',
      summary: `${mutableUser.full_name} completed MFA sign in.`,
      metadata: { method: 'password+mfa' },
      createdAt: nowIso,
    });

    return buildSessionResponse(mutableUser, mutableDb);
  });
}

async function forgotPassword(payload, requestOrigin) {
  const genericMessage = 'If that email exists in AgriGuard, a password reset link has been sent.';
  const email = normalizeEmail(payload.email);

  return updateDb(async (db) => {
    ensureClubCollections(db);
    const user = db.users.find((entry) => entry.email === email && entry.is_active);

    if (!user) {
      return { message: genericMessage };
    }

    const rawToken = createRawPasswordResetToken();
    const tokenHash = hashPasswordResetToken(rawToken);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + env.passwordResetTtlMinutes * 60 * 1000).toISOString();

    db.password_reset_tokens = db.password_reset_tokens.filter(
      (entry) => !(entry.user_id === user.id && !entry.used_at)
    );

    db.password_reset_tokens.unshift({
      id: `pwdreset-${randomUUID()}`,
      user_id: user.id,
      token_hash: tokenHash,
      expires_at: expiresAt,
      used_at: null,
      created_at: now.toISOString(),
    });

    const origin = requestOrigin || env.frontendBaseUrl;
    const resetLink = `${origin.replace(/\/$/, '')}/reset-password/${rawToken}`;
    const emailDelivery = await sendPasswordResetEmail({
      to: user.email,
      fullName: user.full_name,
      resetLink,
      expiresAt,
    });

    logInfo('Password reset requested', {
      email: user.email,
      emailSent: emailDelivery.sent,
    });

    return {
      message: genericMessage,
      previewLink: env.showPasswordResetPreviewLink ? resetLink : null,
      emailDelivery,
    };
  });
}

async function resetPassword(rawToken, payload) {
  return updateDb(async (db) => {
    ensureClubCollections(db);
    const tokenHash = hashPasswordResetToken(rawToken);
    const tokenEntry = db.password_reset_tokens.find((entry) => entry.token_hash === tokenHash);

    if (!tokenEntry || tokenEntry.used_at) {
      throw httpError(400, 'This password reset link is invalid or has already been used.');
    }

    if (new Date(tokenEntry.expires_at) <= new Date()) {
      throw httpError(400, 'This password reset link has expired. Please request a new one.');
    }

    const user = db.users.find((entry) => entry.id === tokenEntry.user_id && entry.is_active);
    if (!user) {
      throw httpError(404, 'User not found.');
    }

    user.password_hash = await hashPassword(payload.password);
    user.updated_at = new Date().toISOString();
    tokenEntry.used_at = new Date().toISOString();

    db.password_reset_tokens = db.password_reset_tokens.map((entry) => {
      if (entry.user_id === user.id && entry.id !== tokenEntry.id && !entry.used_at) {
        return { ...entry, used_at: user.updated_at };
      }
      return entry;
    });

    return {
      message: 'Your password has been reset successfully. You can now sign in with the new password.',
    };
  });
}

async function getCurrentUser(userId) {
  const db = await readDb();
  ensureClubCollections(db);
  const user = db.users.find((entry) => entry.id === userId && entry.is_active);
  if (!user) {
    throw httpError(404, 'User not found.');
  }
  return sanitizeUser(user, db);
}

async function inviteUser(actor, payload, requestOrigin) {
  const email = normalizeEmail(payload.email);

  return updateDb(async (db) => {
    ensureClubCollections(db);
    const existingUser = db.users.find((entry) => entry.email === email);
    if (existingUser) {
      throw httpError(409, 'A user with this email already exists.', {
        errors: { email: 'Email is already registered.' },
      });
    }

    const duplicateInvite = db.invitations.find(
      (entry) => entry.email === email && !entry.accepted_at && new Date(entry.expires_at) > new Date()
    );

    if (duplicateInvite) {
      throw httpError(409, 'A pending invitation already exists for this email.', {
        errors: { email: 'A pending invitation already exists for this email.' },
      });
    }

    if (payload.role === 'admin') {
      throw httpError(400, 'Each club can have only one admin. New invitations can only be for coach or player roles.', {
        errors: { role: 'Only coach or player invitations are allowed.' },
      });
    }

    const selectedTeam = resolveTeamSelection(db, actor.clubId, payload.teamId || '');

    if (payload.role === 'coach' && selectedTeam?.coach_user_id) {
      throw httpError(409, 'This team already has a coach assigned.', {
        errors: { teamId: 'This team already has a coach assigned.' },
      });
    }

    const rawToken = createRawInvitationToken();
    const now = new Date();
    const actorDisplayName = db.users.find((entry) => entry.id === actor.id)?.full_name || 'Club administrator';

    const invitation = {
      id: `invite-${randomUUID()}`,
      email,
      invited_full_name: payload.fullName.trim(),
      role: payload.role,
      team_id: selectedTeam?.id || '',
      team_name: selectedTeam?.name || '',
      club_id: actor.clubId,
      invited_by_user_id: actor.id,
      token_hash: hashInvitationToken(rawToken),
      expires_at: new Date(now.getTime() + env.invitationTtlHours * 60 * 60 * 1000).toISOString(),
      accepted_at: null,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    };

    db.invitations.unshift(invitation);

    logAuditEvent(db, {
      clubId: actor.clubId,
      actorUserId: actor.id,
      entityType: 'invitation',
      entityId: invitation.id,
      actionType: 'user_invited',
      summary: `${actorDisplayName} invited ${invitation.invited_full_name} as ${invitation.role}.`,
      metadata: {
        invited_email: invitation.email,
        role: invitation.role,
        team_name: invitation.team_name || '',
      },
      createdAt: invitation.created_at,
    });

    const origin = requestOrigin || env.frontendBaseUrl;
    const previewLink = `${origin.replace(/\/$/, '')}/accept-invitation/${rawToken}`;
    const inviter = db.users.find((entry) => entry.id === actor.id);
    const club = db.clubs.find((entry) => entry.id === actor.clubId);

    const emailDelivery = await sendInvitationEmail({
      to: email,
      fullName: invitation.invited_full_name,
      inviterName: inviter?.full_name || actor.fullName || 'A club administrator',
      clubName: club?.name || 'your club',
      role: invitation.role,
      team: invitation.team_name,
      inviteLink: previewLink,
      expiresAt: invitation.expires_at,
    });

    logInfo('Invitation created', {
      email,
      role: invitation.role,
      emailSent: emailDelivery.sent,
    });

    return {
      invitation: sanitizeInvitation(invitation),
      previewLink: env.showInvitePreviewLink || !env.emailEnabled ? previewLink : null,
      rawToken: env.showInvitePreviewLink || !env.emailEnabled ? rawToken : null,
      emailDelivery,
    };
  });
}

async function getInvitation(rawToken) {
  const db = await readDb();
  const tokenHash = hashInvitationToken(rawToken);
  const invitation = db.invitations.find((entry) => entry.token_hash === tokenHash);

  if (!invitation) {
    throw httpError(404, 'This invitation is invalid or has already been used.');
  }

  if (invitation.accepted_at) {
    throw httpError(400, 'This invitation is invalid or has already been used.');
  }

  if (new Date(invitation.expires_at) <= new Date()) {
    throw httpError(400, 'This invitation has expired. Please request a new invitation.');
  }

  return sanitizeInvitation(invitation);
}

async function acceptInvitation(rawToken, payload) {
  return updateDb(async (db) => {
    ensureClubCollections(db);
    const tokenHash = hashInvitationToken(rawToken);
    const invitation = db.invitations.find((entry) => entry.token_hash === tokenHash);

    if (!invitation || invitation.accepted_at) {
      throw httpError(400, 'This invitation is invalid or has already been used.');
    }

    if (new Date(invitation.expires_at) <= new Date()) {
      throw httpError(400, 'This invitation has expired. Please request a new invitation.');
    }

    const selectedTeam = getInvitationTeamOrThrow(db, invitation.club_id, invitation.team_id || '');

    const existingUser = db.users.find((entry) => entry.email === invitation.email);
    if (existingUser) {
      throw httpError(409, 'A user with this invitation email already exists.');
    }

    const now = new Date().toISOString();
    const user = {
      id: `user-${randomUUID()}`,
      full_name: payload.fullName.trim(),
      email: invitation.email,
      password_hash: await hashPassword(payload.password),
      role: invitation.role,
      club_id: invitation.club_id,
      assigned_team: selectedTeam?.name || '',
      is_active: true,
      email_verified_at: now,
      mfa_enabled: false,
      mfa_secret_encrypted: '',
      mfa_pending_secret_encrypted: '',
      last_login_at: null,
      created_at: now,
      updated_at: now,
    };

    if (invitation.role === 'coach' && selectedTeam) {
      if (selectedTeam.coach_user_id) {
        throw httpError(409, 'This team already has a coach assigned.');
      }
      selectedTeam.coach_user_id = user.id;
      selectedTeam.updated_at = now;
    }

    if (invitation.role === 'player') {
      const player = {
        id: `player-${randomUUID()}`,
        user_id: user.id,
        club_id: invitation.club_id,
        jersey_number: null,
        preferred_position: '',
        created_at: now,
        updated_at: now,
      };

      db.players.push(player);

      if (selectedTeam) {
        const membership = {
          id: `membership-${randomUUID()}`,
          team_id: selectedTeam.id,
          player_id: player.id,
          created_at: now,
        };

        db.team_memberships.push(membership);
      }
    }

    invitation.accepted_at = now;
    invitation.updated_at = now;
    db.users.push(user);

    logRoleChange(db, {
      clubId: invitation.club_id,
      userId: user.id,
      oldRole: null,
      newRole: user.role,
      changedByUserId: invitation.invited_by_user_id,
      reason: 'Invitation accepted',
      changedAt: now,
    });

    if (selectedTeam) {
      logTeamAssignmentChange(db, {
        clubId: invitation.club_id,
        userId: user.id,
        oldTeamId: null,
        oldTeamName: '',
        newTeamId: selectedTeam.id,
        newTeamName: selectedTeam.name,
        changeType: 'assigned',
        changedByUserId: invitation.invited_by_user_id,
        changedAt: now,
      });
    }

    logAuditEvent(db, {
      clubId: invitation.club_id,
      actorUserId: user.id,
      targetUserId: user.id,
      entityType: 'user',
      entityId: user.id,
      actionType: 'invitation_accepted',
      summary: `${user.full_name} accepted the invitation as ${user.role}.`,
      metadata: { team_name: selectedTeam?.name || '' },
      createdAt: now,
    });

    return buildSessionResponse(user, db);
  });
}

async function listUsers(actor, query = '') {
  const db = await readDb();
  ensureClubCollections(db);
  const normalized = query.trim().toLowerCase();
  let users = db.users.filter((entry) => entry.club_id === actor.clubId);

  if (normalized) {
    users = users.filter((entry) => {
      return [entry.full_name, entry.email, entry.role, resolveUserTeamName(db, entry)]
        .join(' ')
        .toLowerCase()
        .includes(normalized);
    });
  }

  return users.map((user) => sanitizeUser(user, db));
}

async function updateUserRole(actor, userId, payload) {
  return updateDb(async (db) => {
    ensureClubCollections(db);
    const user = db.users.find((entry) => entry.id === userId && entry.club_id === actor.clubId);
    if (!user) {
      throw httpError(404, 'User not found.');
    }

    if (payload.role === 'admin') {
      throw httpError(400, 'Each club can have only one admin. Role assignment can only switch users to coach or player.', {
        errors: { role: 'Only coach or player roles can be assigned here.' },
      });
    }

    if (user.id === actor.id) {
      throw httpError(400, 'The club admin role is fixed and cannot be edited from the role assignment page.');
    }

    if (user.role === 'admin') {
      throw httpError(400, 'Admin accounts cannot be edited from the role assignment page.');
    }

    const actorDisplayName = db.users.find((entry) => entry.id === actor.id)?.full_name || 'Club administrator';
    const previousRole = user.role;
    const previousTeamState = getUserTeamState(db, user);
    const resolvedTeamName = syncUserTeamAssignment(db, user, payload.role, payload.teamId || '');
    const nextTeamState = getUserTeamState(db, { ...user, role: payload.role, assigned_team: resolvedTeamName }, payload.role);

    user.role = payload.role;
    user.assigned_team = resolvedTeamName;
    user.updated_at = new Date().toISOString();

    logRoleChange(db, {
      clubId: actor.clubId,
      userId: user.id,
      oldRole: previousRole,
      newRole: user.role,
      changedByUserId: actor.id,
      reason: 'Role updated by administrator',
      changedAt: user.updated_at,
    });

    logTeamAssignmentChange(db, {
      clubId: actor.clubId,
      userId: user.id,
      oldTeamId: previousTeamState.teamId,
      oldTeamName: previousTeamState.teamName,
      newTeamId: nextTeamState.teamId,
      newTeamName: nextTeamState.teamName,
      changeType: previousTeamState.teamName && nextTeamState.teamName ? 'reassigned' : nextTeamState.teamName ? 'assigned' : 'unassigned',
      changedByUserId: actor.id,
      changedAt: user.updated_at,
    });

    logAuditEvent(db, {
      clubId: actor.clubId,
      actorUserId: actor.id,
      targetUserId: user.id,
      entityType: 'user',
      entityId: user.id,
      actionType: 'user_role_updated',
      summary: `${actorDisplayName} changed ${user.full_name} from ${previousRole} to ${user.role}.`,
      metadata: {
        previous_role: previousRole,
        new_role: user.role,
        previous_team: previousTeamState.teamName,
        new_team: nextTeamState.teamName,
      },
      createdAt: user.updated_at,
    });

    return sanitizeUser(user, db);
  });
}

async function updateUserStatus(actor, userId, payload) {
  return updateDb(async (db) => {
    ensureClubCollections(db);
    const user = db.users.find((entry) => entry.id === userId && entry.club_id === actor.clubId);
    if (!user) {
      throw httpError(404, 'User not found.');
    }

    if (user.id === actor.id || user.role === 'admin') {
      throw httpError(400, 'The club admin account is fixed and cannot be deactivated from this page.');
    }

    const actorDisplayName = db.users.find((entry) => entry.id === actor.id)?.full_name || 'Club administrator';

    if (user.is_active === payload.isActive) {
      return sanitizeUser(user, db);
    }

    user.is_active = payload.isActive;
    user.updated_at = new Date().toISOString();

    logAuditEvent(db, {
      clubId: actor.clubId,
      actorUserId: actor.id,
      targetUserId: user.id,
      entityType: 'user',
      entityId: user.id,
      actionType: payload.isActive ? 'user_reactivated' : 'user_deactivated',
      summary: `${actorDisplayName} ${payload.isActive ? 'reactivated' : 'deactivated'} ${user.full_name}.`,
      metadata: {
        new_status: payload.isActive ? 'active' : 'inactive',
        role: user.role,
      },
      createdAt: user.updated_at,
    });

    return sanitizeUser(user, db);
  });
}

async function deleteUser(actor, userId) {
  return updateUserStatus(actor, userId, { isActive: false });
}

async function getAdminAudit(actor) {
  const db = await readDb();
  ensureClubCollections(db);
  return buildAdminAuditView(db, actor);
}

async function getMyHistory(actor) {
  const db = await readDb();
  ensureClubCollections(db);
  return buildMyHistoryView(db, actor);
}

async function listTeams(actor) {
  const db = await readDb();
  ensureClubCollections(db);
  return db.teams
    .filter((entry) => entry.club_id === actor.clubId)
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((team) => ({
      id: team.id,
      name: team.name,
    }));
}

async function beginMfaSetup(actor) {
  return updateDb(async (db) => {
    ensureClubCollections(db);
    const user = db.users.find((entry) => entry.id === actor.id && entry.is_active);
    if (!user) {
      throw httpError(404, 'User not found.');
    }

    ensureUserSecurityDefaults(user);

    if (user.mfa_enabled && user.mfa_secret_encrypted) {
      throw httpError(400, 'Authenticator app verification is already enabled for this account.');
    }

    const secret = generateBase32Secret();
    user.mfa_pending_secret_encrypted = encryptText(secret);
    user.updated_at = new Date().toISOString();

    return buildMfaProvisioningResponse(user, secret);
  });
}

async function verifyMfaSetup(actor, payload) {
  return updateDb(async (db) => {
    ensureClubCollections(db);
    const user = db.users.find((entry) => entry.id === actor.id && entry.is_active);
    if (!user) {
      throw httpError(404, 'User not found.');
    }

    ensureUserSecurityDefaults(user);

    if (!user.mfa_pending_secret_encrypted) {
      throw httpError(400, 'Start MFA setup first before verifying the authenticator code.');
    }

    const pendingSecret = decryptText(user.mfa_pending_secret_encrypted);
    const isValid = verifyTotp(normalizeCode(payload.code), pendingSecret, { window: 1 });

    if (!isValid) {
      throw httpError(400, 'The authenticator code is invalid or expired.');
    }

    user.mfa_secret_encrypted = user.mfa_pending_secret_encrypted;
    user.mfa_pending_secret_encrypted = '';
    user.mfa_enabled = true;
    user.updated_at = new Date().toISOString();

    return {
      message: 'Authenticator app MFA has been enabled successfully.',
      user: sanitizeUser(user, db),
    };
  });
}

async function disableMfa(actor, payload) {
  return updateDb(async (db) => {
    ensureClubCollections(db);
    const user = db.users.find((entry) => entry.id === actor.id && entry.is_active);
    if (!user) {
      throw httpError(404, 'User not found.');
    }

    ensureUserSecurityDefaults(user);

    if (!user.mfa_enabled || !user.mfa_secret_encrypted) {
      throw httpError(400, 'Authenticator app MFA is not enabled for this account.');
    }

    const passwordMatches = await verifyPassword(payload.password, user.password_hash);
    if (!passwordMatches) {
      throw httpError(401, 'Current password is incorrect.', {
        errors: { password: 'Current password is incorrect.' },
      });
    }

    const secret = decryptText(user.mfa_secret_encrypted);
    const isValid = verifyTotp(normalizeCode(payload.code), secret, { window: 1 });

    if (!isValid) {
      throw httpError(401, 'The authenticator code is invalid or expired.', {
        errors: { code: 'The authenticator code is invalid or expired.' },
      });
    }

    user.mfa_enabled = false;
    user.mfa_secret_encrypted = '';
    user.mfa_pending_secret_encrypted = '';
    user.updated_at = new Date().toISOString();

    return {
      message: 'Authenticator app MFA has been disabled.',
      user: sanitizeUser(user, db),
    };
  });
}

module.exports = {
  registerAdmin,
  verifyAdminEmail,
  login,
  verifyLoginMfa,
  forgotPassword,
  resetPassword,
  getCurrentUser,
  inviteUser,
  getInvitation,
  acceptInvitation,
  listUsers,
  updateUserRole,
  updateUserStatus,
  deleteUser,
  getAdminAudit,
  getMyHistory,
  listTeams,
  beginMfaSetup,
  verifyMfaSetup,
  disableMfa,
};
