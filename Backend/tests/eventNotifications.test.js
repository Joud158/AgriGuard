process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key';
process.env.EMAIL_ENABLED = 'false';

const request = require('supertest');
const app = require('../src/app');
const { randomUUID } = require('crypto');
const { readDb, resetDb, updateDb } = require('../src/data/store');

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

describe('AgriGuard event notification triggers', () => {
  test('creating an event generates notifications for the team coach and assigned players', async () => {
    const adminToken = await login('admin@agriguard.com', 'Admin@123!');
    const coachToken = await login('coach@agriguard.com', 'Coach@123!');
    const playerToken = await login('player@agriguard.com', 'Player@123!');

    const users = await listUsers(adminToken);
    const coachUser = users.find((entry) => entry.role === 'coach');
    const playerUser = users.find((entry) => entry.email === 'player@agriguard.com');

    const teamResponse = await request(app)
      .post('/api/teams')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Tigers',
        coachUserId: coachUser.id,
      });

    const teamId = teamResponse.body.data.id;

    const playerResponse = await request(app)
      .post('/api/players')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        userId: playerUser.id,
        jerseyNumber: 7,
        preferredPosition: 'Setter',
      });

    const playerId = playerResponse.body.data.id;

    await request(app)
      .post(`/api/teams/${teamId}/players`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ playerId });

    const eventResponse = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        teamId,
        title: 'Morning Practice',
        type: 'training',
        description: 'Bring your gear.',
        location: 'Main Hall',
        startTime: '2026-04-06T08:00:00.000Z',
        endTime: '2026-04-06T10:00:00.000Z',
      });

    expect(eventResponse.statusCode).toBe(201);

    const coachNotificationsResponse = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${coachToken}`);

    const playerNotificationsResponse = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${playerToken}`);

    expect(coachNotificationsResponse.statusCode).toBe(200);
    expect(coachNotificationsResponse.body.data).toHaveLength(1);
    expect(coachNotificationsResponse.body.data[0].type).toBe('event_created');
    expect(coachNotificationsResponse.body.data[0].related_entity_id).toBe(eventResponse.body.data.id);

    expect(playerNotificationsResponse.statusCode).toBe(200);
    expect(playerNotificationsResponse.body.data).toHaveLength(1);
    expect(playerNotificationsResponse.body.data[0].type).toBe('event_created');
    expect(playerNotificationsResponse.body.data[0].related_entity_id).toBe(eventResponse.body.data.id);
  });

  test('updating an event generates updated notifications for the same team recipients', async () => {
    const adminToken = await login('admin@agriguard.com', 'Admin@123!');
    const coachToken = await login('coach@agriguard.com', 'Coach@123!');
    const playerToken = await login('player@agriguard.com', 'Player@123!');

    const users = await listUsers(adminToken);
    const coachUser = users.find((entry) => entry.role === 'coach');
    const playerUser = users.find((entry) => entry.email === 'player@agriguard.com');

    const teamResponse = await request(app)
      .post('/api/teams')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Eagles',
        coachUserId: coachUser.id,
      });

    const teamId = teamResponse.body.data.id;

    const playerResponse = await request(app)
      .post('/api/players')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        userId: playerUser.id,
        jerseyNumber: 12,
        preferredPosition: 'Libero',
      });

    await request(app)
      .post(`/api/teams/${teamId}/players`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ playerId: playerResponse.body.data.id });

    const createResponse = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        teamId,
        title: 'Evening Practice',
        type: 'training',
        description: 'Initial schedule.',
        location: 'Court A',
        startTime: '2026-04-06T17:00:00.000Z',
        endTime: '2026-04-06T19:00:00.000Z',
      });

    const eventId = createResponse.body.data.id;

    const updateResponse = await request(app)
      .patch(`/api/events/${eventId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        location: 'Court B',
        startTime: '2026-04-06T18:00:00.000Z',
        endTime: '2026-04-06T20:00:00.000Z',
      });

    expect(updateResponse.statusCode).toBe(200);

    const coachNotificationsResponse = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${coachToken}`);

    const playerNotificationsResponse = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${playerToken}`);

    expect(coachNotificationsResponse.body.data).toHaveLength(2);
    expect(coachNotificationsResponse.body.data[0].type).toBe('event_updated');
    expect(coachNotificationsResponse.body.data[0].related_entity_id).toBe(eventId);

    expect(playerNotificationsResponse.body.data).toHaveLength(2);
    expect(playerNotificationsResponse.body.data[0].type).toBe('event_updated');
    expect(playerNotificationsResponse.body.data[0].related_entity_id).toBe(eventId);
  });

  test('deleting an event generates cancellation notifications for the same team recipients', async () => {
    const adminToken = await login('admin@agriguard.com', 'Admin@123!');
    const coachToken = await login('coach@agriguard.com', 'Coach@123!');
    const playerToken = await login('player@agriguard.com', 'Player@123!');

    const users = await listUsers(adminToken);
    const adminUser = users.find((entry) => entry.role === 'admin');
    const coachUser = users.find((entry) => entry.role === 'coach');
    const playerUser = users.find((entry) => entry.email === 'player@agriguard.com');
    const now = new Date().toISOString();
    const teamId = `team-${randomUUID()}`;
    const playerId = `player-${randomUUID()}`;
    const eventId = `event-${randomUUID()}`;

    await updateDb(async (db) => {
      db.teams.unshift({
        id: teamId,
        club_id: adminUser.club_id,
        name: 'Panthers',
        coach_user_id: coachUser.id,
        created_at: now,
        updated_at: now,
      });

      db.players.unshift({
        id: playerId,
        user_id: playerUser.id,
        club_id: adminUser.club_id,
        jersey_number: 4,
        preferred_position: 'Outside Hitter',
        created_at: now,
        updated_at: now,
      });

      db.team_memberships.unshift({
        id: `membership-${randomUUID()}`,
        team_id: teamId,
        player_id: playerId,
        created_at: now,
      });

      db.events.unshift({
        id: eventId,
        club_id: adminUser.club_id,
        team_id: teamId,
        title: 'Cancelled Scrimmage',
        type: 'match',
        description: 'Pre-season scrimmage.',
        location: 'Court D',
        start_time: '2026-04-12T16:00:00.000Z',
        end_time: '2026-04-12T18:00:00.000Z',
        created_by: adminUser.id,
        created_at: now,
        updated_at: now,
      });
    });

    const deleteResponse = await request(app)
      .delete(`/api/events/${eventId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(deleteResponse.statusCode).toBe(200);
    expect(deleteResponse.body.data.id).toBe(eventId);

    const coachNotificationsResponse = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${coachToken}`);

    const playerNotificationsResponse = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${playerToken}`);

    expect(coachNotificationsResponse.body.data).toHaveLength(2);
    expect(coachNotificationsResponse.body.data[0].type).toBe('event_cancelled');
    expect(coachNotificationsResponse.body.data[0].related_entity_id).toBe(eventId);
    expect(coachNotificationsResponse.body.data[0].message).toContain('was cancelled');

    expect(playerNotificationsResponse.body.data).toHaveLength(2);
    expect(playerNotificationsResponse.body.data[0].type).toBe('event_cancelled');
    expect(playerNotificationsResponse.body.data[0].related_entity_id).toBe(eventId);
    expect(playerNotificationsResponse.body.data[0].message).toContain('was cancelled');
  });

  test('coach only sees events for their own teams and cannot directly manage official events', async () => {
    const adminToken = await login('admin@agriguard.com', 'Admin@123!');
    const coachToken = await login('coach@agriguard.com', 'Coach@123!');

    const users = await listUsers(adminToken);
    const coachUser = users.find((entry) => entry.role === 'coach');

    const firstTeamResponse = await request(app)
      .post('/api/teams')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Falcons',
        coachUserId: coachUser.id,
      });

    const secondTeamResponse = await request(app)
      .post('/api/teams')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Wolves',
        coachUserId: coachUser.id,
      });

    const foreignTeamResponse = await request(app)
      .post('/api/teams')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Rockets',
        coachUserId: null,
      });

    const ownEventOneResponse = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        teamId: firstTeamResponse.body.data.id,
        title: 'Falcons Practice',
        type: 'training',
        description: 'Team one session.',
        location: 'Court 1',
        startTime: '2026-04-07T08:00:00.000Z',
        endTime: '2026-04-07T10:00:00.000Z',
      });

    const ownEventTwoResponse = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        teamId: secondTeamResponse.body.data.id,
        title: 'Wolves Match Prep',
        type: 'meeting',
        description: 'Team two review.',
        location: 'Video Room',
        startTime: '2026-04-08T14:00:00.000Z',
        endTime: '2026-04-08T15:00:00.000Z',
      });

    const foreignEventResponse = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        teamId: foreignTeamResponse.body.data.id,
        title: 'Rockets Session',
        type: 'training',
        description: 'Foreign team session.',
        location: 'Court 3',
        startTime: '2026-04-09T11:00:00.000Z',
        endTime: '2026-04-09T13:00:00.000Z',
      });

    const coachListResponse = await request(app)
      .get('/api/events')
      .set('Authorization', `Bearer ${coachToken}`);

    expect(coachListResponse.statusCode).toBe(200);
    expect(coachListResponse.body.data).toHaveLength(2);
    expect(coachListResponse.body.data.some((entry) => entry.id === ownEventOneResponse.body.data.id)).toBe(true);
    expect(coachListResponse.body.data.some((entry) => entry.id === ownEventTwoResponse.body.data.id)).toBe(true);
    expect(coachListResponse.body.data.some((entry) => entry.id === foreignEventResponse.body.data.id)).toBe(false);

    const coachOwnEventResponse = await request(app)
      .get(`/api/events/${ownEventOneResponse.body.data.id}`)
      .set('Authorization', `Bearer ${coachToken}`);

    expect(coachOwnEventResponse.statusCode).toBe(200);
    expect(coachOwnEventResponse.body.data.id).toBe(ownEventOneResponse.body.data.id);

    const coachForeignEventResponse = await request(app)
      .get(`/api/events/${foreignEventResponse.body.data.id}`)
      .set('Authorization', `Bearer ${coachToken}`);

    expect(coachForeignEventResponse.statusCode).toBe(404);

    const coachCreateEventResponse = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${coachToken}`)
      .send({
        teamId: firstTeamResponse.body.data.id,
        title: 'Blocked Coach Event',
        type: 'training',
        description: 'Should be rejected.',
        location: 'Court 4',
        startTime: '2026-04-10T08:00:00.000Z',
        endTime: '2026-04-10T09:00:00.000Z',
      });

    expect(coachCreateEventResponse.statusCode).toBe(403);
    expect(coachCreateEventResponse.body.message).toBe(
      'You do not have permission to access this feature.'
    );

    const coachUpdateOwnEventResponse = await request(app)
      .patch(`/api/events/${ownEventOneResponse.body.data.id}`)
      .set('Authorization', `Bearer ${coachToken}`)
      .send({
        location: 'Court 5',
      });

    expect(coachUpdateOwnEventResponse.statusCode).toBe(403);
    expect(coachUpdateOwnEventResponse.body.message).toBe(
      'You do not have permission to access this feature.'
    );

    const coachDeleteOwnEventResponse = await request(app)
      .delete(`/api/events/${ownEventOneResponse.body.data.id}`)
      .set('Authorization', `Bearer ${coachToken}`);

    expect(coachDeleteOwnEventResponse.statusCode).toBe(403);
    expect(coachDeleteOwnEventResponse.body.message).toBe(
      'You do not have permission to access this feature.'
    );
  });
});
