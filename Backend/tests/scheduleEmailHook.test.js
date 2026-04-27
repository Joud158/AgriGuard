process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key';
process.env.EMAIL_ENABLED = 'true';
process.env.EMAIL_PROVIDER = 'smtp';

const request = require('supertest');
const app = require('../src/app');
const { randomUUID } = require('crypto');
const { readDb, resetDb, updateDb } = require('../src/data/store');

jest.mock('../src/services/emailProviders/smtpEmailProvider', () => ({
  send: jest.fn(async () => {
    throw new Error('SMTP unavailable');
  }),
}));

jest.setTimeout(15000);

beforeEach(async () => {
  await resetDb();
});

async function login(email, password) {
  const response = await request(app).post('/api/auth/login').send({ email, password });
  return response.body.data.token;
}

async function listUsers() {
  const db = await readDb();
  return db.users;
}

describe('AgriGuard schedule email hook', () => {
  test('event creation still succeeds when email sending fails', async () => {
    const adminToken = await login('admin@agriguard.com', 'Admin@123!');
    const users = await listUsers(adminToken);
    const coachUser = users.find((entry) => entry.role === 'coach');

    const teamResponse = await request(app)
      .post('/api/teams')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Sharks',
        coachUserId: coachUser.id,
      });

    const response = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        teamId: teamResponse.body.data.id,
        title: 'Email Failure Practice',
        type: 'training',
        description: 'Still should create.',
        location: 'Court C',
        startTime: '2026-04-08T08:00:00.000Z',
        endTime: '2026-04-08T10:00:00.000Z',
      });

    expect(response.statusCode).toBe(201);
    expect(response.body.success).toBe(true);

    const db = await readDb();
    const coachNotifications = db.notifications.filter((entry) => entry.user_id === coachUser.id);

    expect(coachNotifications).toHaveLength(1);
    expect(coachNotifications[0].type).toBe('event_created');
  });

  test('event deletion still succeeds when cancellation email sending fails', async () => {
    const adminToken = await login('admin@agriguard.com', 'Admin@123!');
    const users = await listUsers(adminToken);
    const adminUser = users.find((entry) => entry.role === 'admin');
    const coachUser = users.find((entry) => entry.role === 'coach');
    const now = new Date().toISOString();
    const teamId = `team-${randomUUID()}`;
    const eventId = `event-${randomUUID()}`;

    await updateDb(async (db) => {
      db.teams.unshift({
        id: teamId,
        club_id: adminUser.club_id,
        name: 'Barracudas',
        coach_user_id: coachUser.id,
        created_at: now,
        updated_at: now,
      });

      db.events.unshift({
        id: eventId,
        club_id: adminUser.club_id,
        team_id: teamId,
        title: 'Deletion Email Failure Practice',
        type: 'training',
        description: 'Still should delete.',
        location: 'Court E',
        start_time: '2026-04-09T08:00:00.000Z',
        end_time: '2026-04-09T10:00:00.000Z',
        created_by: adminUser.id,
        created_at: now,
        updated_at: now,
      });
    });

    const deleteResponse = await request(app)
      .delete(`/api/events/${eventId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(deleteResponse.statusCode).toBe(200);
    expect(deleteResponse.body.success).toBe(true);

    const db = await readDb();
    const coachNotifications = db.notifications.filter((entry) => entry.user_id === coachUser.id);

    expect(coachNotifications).toHaveLength(1);
    expect(coachNotifications[0].type).toBe('event_cancelled');
  });
});
