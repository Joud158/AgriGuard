process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key';

const request = require('supertest');
const app = require('../src/app');
const { resetDb, updateDb } = require('../src/data/store');
const { createNotificationRecord } = require('../src/services/notificationService');

jest.setTimeout(15000);

beforeEach(async () => {
  await resetDb();
});

async function login(email, password) {
  const response = await request(app).post('/api/auth/login').send({ email, password });
  return response.body.data.token;
}

async function seedNotifications() {
  await updateDb(async (db) => {
    const admin = db.users.find((entry) => entry.email === 'admin@agriguard.com');
    const coach = db.users.find((entry) => entry.email === 'coach@agriguard.com');
    const player = db.users.find((entry) => entry.email === 'player@agriguard.com');

    db.notifications.unshift(
      createNotificationRecord({
        clubId: admin.club_id,
        userId: admin.id,
        teamId: '',
        type: 'announcement_created',
        message: 'Admin notification',
        relatedEntityType: 'announcement',
        relatedEntityId: 'announcement-1',
      })
    );

    db.notifications.unshift(
      createNotificationRecord({
        clubId: coach.club_id,
        userId: coach.id,
        teamId: '',
        type: 'event_updated',
        message: 'Coach notification',
        relatedEntityType: 'event',
        relatedEntityId: 'event-1',
      })
    );

    db.notifications.unshift(
      createNotificationRecord({
        clubId: player.club_id,
        userId: player.id,
        teamId: '',
        type: 'event_created',
        message: 'Player notification',
        relatedEntityType: 'event',
        relatedEntityId: 'event-2',
      })
    );
  });
}

describe('AgriGuard notifications backend', () => {
  test('authenticated user can list only their own notifications', async () => {
    await seedNotifications();
    const playerToken = await login('player@agriguard.com', 'Player@123!');

    const response = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${playerToken}`);

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].message).toBe('Player notification');
    expect(response.body.data[0].is_read).toBe(false);
  });

  test('authenticated user can mark their own notification as read', async () => {
    await seedNotifications();
    const playerToken = await login('player@agriguard.com', 'Player@123!');

    const listResponse = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${playerToken}`);

    const notificationId = listResponse.body.data[0].id;

    const response = await request(app)
      .patch(`/api/notifications/${notificationId}/read`)
      .set('Authorization', `Bearer ${playerToken}`);

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.id).toBe(notificationId);
    expect(response.body.data.is_read).toBe(true);
    expect(response.body.data.read_at).toBeTruthy();
  });

  test('user cannot mark another user notification as read', async () => {
    await seedNotifications();
    const playerToken = await login('player@agriguard.com', 'Player@123!');
    const coachToken = await login('coach@agriguard.com', 'Coach@123!');

    const coachListResponse = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${coachToken}`);

    const coachNotificationId = coachListResponse.body.data[0].id;

    const response = await request(app)
      .patch(`/api/notifications/${coachNotificationId}/read`)
      .set('Authorization', `Bearer ${playerToken}`);

    expect(response.statusCode).toBe(404);
    expect(response.body.success).toBe(false);
  });
});
