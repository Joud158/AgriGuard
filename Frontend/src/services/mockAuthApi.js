
const STORAGE_KEY = 'agriguard-mock-db';

const seed = {
  users: [
    {
      id: 'u-admin-1',
      fullName: 'Emily Parker',
      email: 'admin@agriguard.com',
      password: 'Admin@123!',
      role: 'admin',
      team: '',
      clubName: 'AgriGuard Club',
      city: 'Beirut',
    },
    {
      id: 'u-coach-1',
      fullName: 'John Mitchell',
      email: 'coach@agriguard.com',
      password: 'Coach@123!',
      role: 'coach',
      team: 'Tigers',
    },
    {
      id: 'u-player-1',
      fullName: 'Jacob Turner',
      email: 'player@agriguard.com',
      password: 'Player@123!',
      role: 'player',
      team: 'Eagles',
    },
    {
      id: 'u-2',
      fullName: 'Laura Reed',
      email: 'laura.reed@agriguard.com',
      password: 'Player@123!',
      role: 'player',
      team: 'Tigers',
    },
    {
      id: 'u-3',
      fullName: 'Sophie Brooks',
      email: 'sophie.brooks@agriguard.com',
      password: 'Player@123!',
      role: 'player',
      team: 'Senior Team',
    },
    {
      id: 'u-4',
      fullName: 'Tyler Evans',
      email: 'tyler.evans@agriguard.com',
      password: 'Coach@123!',
      role: 'coach',
      team: 'Eagles',
    },
    {
      id: 'u-5',
      fullName: 'Natalie Quinn',
      email: 'natalie.quinn@agriguard.com',
      password: 'Player@123!',
      role: 'player',
      team: 'Junior Team',
    },
    {
      id: 'u-6',
      fullName: 'Brandon Morris',
      email: 'brandon.morris@agriguard.com',
      password: 'Player@123!',
      role: 'player',
      team: 'Senior Team',
    },
    {
      id: 'u-7',
      fullName: 'Hannah Scott',
      email: 'hannah.scott@agriguard.com',
      password: 'Player@123!',
      role: 'player',
      team: 'Junior Team',
    },
    {
      id: 'u-8',
      fullName: 'Ethan Matthews',
      email: 'ethan.matthews@agriguard.com',
      password: 'Coach@123!',
      role: 'coach',
      team: 'Tigers',
    },
  ],
  invitations: [
    {
      token: 'invite-coach-123',
      email: 'new.coach@agriguard.com',
      role: 'coach',
      team: 'Tigers',
      status: 'pending',
      invitedBy: 'u-admin-1',
    },
    {
      token: 'invite-player-123',
      email: 'new.player@agriguard.com',
      role: 'player',
      team: 'Eagles',
      status: 'pending',
      invitedBy: 'u-admin-1',
    },
  ],
};

function sleep(ms = 650) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadDb() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
    return JSON.parse(JSON.stringify(seed));
  }

  return JSON.parse(raw);
}

function saveDb(db) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

function buildToken(user) {
  return btoa(`${user.id}:${user.role}:${Date.now()}`);
}

function sanitizeUser(user) {
  const { password, ...safeUser } = user;
  return safeUser;
}

export async function login(payload) {
  await sleep();
  const db = loadDb();
  const user = db.users.find(
    (entry) => entry.email.toLowerCase() === payload.email.trim().toLowerCase()
  );

  if (!user || user.password !== payload.password) {
    return {
      success: false,
      message: 'Wrong email or password. Try again.',
    };
  }

  return {
    success: true,
    data: {
      token: buildToken(user),
      user: sanitizeUser(user),
    },
  };
}

export async function registerAdmin(payload) {
  await sleep();
  const db = loadDb();
  const exists = db.users.some(
    (entry) => entry.email.toLowerCase() === payload.email.trim().toLowerCase()
  );

  if (exists) {
    return {
      success: false,
      message: 'An account with this email already exists.',
      errors: {
        email: 'Email is already in use.',
      },
    };
  }

  const user = {
    id: `u-${crypto.randomUUID()}`,
    fullName: payload.fullName.trim(),
    email: payload.email.trim().toLowerCase(),
    password: payload.password,
    role: 'admin',
    team: '',
    clubName: payload.clubName.trim(),
    city: payload.city.trim(),
  };

  db.users.unshift(user);
  saveDb(db);

  return {
    success: true,
    data: {
      token: buildToken(user),
      user: sanitizeUser(user),
    },
  };
}

export async function getInvitation(token) {
  await sleep(400);
  const db = loadDb();
  const invitation = db.invitations.find((entry) => entry.token === token);

  if (!invitation || invitation.status !== 'pending') {
    return {
      success: false,
      message: 'This invitation is invalid or has already been used.',
    };
  }

  return {
    success: true,
    data: invitation,
  };
}

export async function acceptInvitation(token, payload) {
  await sleep();
  const db = loadDb();
  const invitation = db.invitations.find((entry) => entry.token === token);

  if (!invitation || invitation.status !== 'pending') {
    return {
      success: false,
      message: 'This invitation is invalid or has already been used.',
    };
  }

  const exists = db.users.some(
    (entry) => entry.email.toLowerCase() === invitation.email.toLowerCase()
  );

  if (exists) {
    return {
      success: false,
      message: 'A user with this invitation email already exists.',
    };
  }

  const user = {
    id: `u-${crypto.randomUUID()}`,
    fullName: payload.fullName.trim(),
    email: invitation.email.toLowerCase(),
    password: payload.password,
    role: invitation.role,
    team: invitation.team ?? '',
  };

  invitation.status = 'accepted';
  db.users.push(user);
  saveDb(db);

  return {
    success: true,
    data: {
      token: buildToken(user),
      user: sanitizeUser(user),
    },
  };
}

export async function inviteUser(payload) {
  await sleep();
  const db = loadDb();
  const email = payload.email.trim().toLowerCase();
  const exists = db.users.some((entry) => entry.email.toLowerCase() === email);

  if (exists) {
    return {
      success: false,
      message: 'A user with this email already exists.',
      errors: {
        email: 'Email is already registered.',
      },
    };
  }

  const token = `invite-${crypto.randomUUID()}`;
  const invitation = {
    token,
    email,
    fullName: payload.fullName.trim(),
    role: payload.role,
    team: payload.team?.trim() || '',
    status: 'pending',
    invitedBy: 'u-admin-1',
  };

  db.invitations.unshift(invitation);
  saveDb(db);

  return {
    success: true,
    data: {
      invitation,
      previewLink: `${window.location.origin}/accept-invitation/${token}`,
    },
  };
}

export async function getUsers() {
  await sleep(350);
  const db = loadDb();
  return {
    success: true,
    data: db.users.map(sanitizeUser),
  };
}

export async function updateUserRole(userId, payload) {
  await sleep();
  const db = loadDb();
  const user = db.users.find((entry) => entry.id === userId);

  if (!user) {
    return {
      success: false,
      message: 'User not found.',
    };
  }

  user.role = payload.role;
  user.team = payload.team ?? '';
  saveDb(db);

  return {
    success: true,
    data: sanitizeUser(user),
  };
}
