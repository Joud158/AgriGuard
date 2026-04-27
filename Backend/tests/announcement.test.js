process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key';
process.env.EMAIL_ENABLED = 'true';
process.env.EMAIL_PROVIDER = 'stub';

const { randomUUID } = require('crypto');
const request = require('supertest');
const app = require('../src/app');
const { resetDb, updateDb } = require('../src/data/store');
const { hashPassword } = require('../src/utils/passwords');

jest.setTimeout(15000);

beforeEach(async () => {
  await resetDb();
});

async function login(email, password) {
  const response = await request(app).post('/api/auth/login').send({ email, password });
  return response.body.data.token;
}

async function createSecondActiveAdmin() {
  const now = new Date().toISOString();
  const clubId = `club-${randomUUID()}`;
  const userId = `user-${randomUUID()}`;

  await updateDb(async (db) => {
    db.clubs.unshift({
      id: clubId,
      name: 'Second Club',
      city: 'Byblos',
      created_at: now,
      updated_at: now,
    });

    db.users.unshift({
      id: userId,
      full_name: 'Second Admin',
      email: 'second-admin@example.com',
      password_hash: await hashPassword('StrongPass@123'),
      role: 'admin',
      club_id: clubId,
      assigned_team: '',
      is_active: true,
      email_verified_at: now,
      mfa_enabled: false,
      mfa_secret_encrypted: '',
      mfa_pending_secret_encrypted: '',
      created_at: now,
      updated_at: now,
    });
  });
}

describe('AgriGuard announcements backend', () => {
  test('admin and coach can create announcements, and authenticated users can view them within their club', async () => {
    const adminToken = await login('admin@agriguard.com', 'Admin@123!');
    const coachToken = await login('coach@agriguard.com', 'Coach@123!');
    const playerToken = await login('player@agriguard.com', 'Player@123!');

    const teamResponse = await request(app)
      .post('/api/teams')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Tigers',
        coachUserId: null,
      });

    expect(teamResponse.statusCode).toBe(201);
    const teamId = teamResponse.body.data.id;

    const usersResponse = await request(app)
      .get('/api/auth/users')
      .set('Authorization', `Bearer ${adminToken}`);

    const coachUser = usersResponse.body.data.find((entry) => entry.email === 'coach@agriguard.com');
    const playerUser = usersResponse.body.data.find((entry) => entry.email === 'player@agriguard.com');

    await request(app)
      .patch(`/api/teams/${teamId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        coachUserId: coachUser.id,
      });

    const playerResponse = await request(app)
      .post('/api/players')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        userId: playerUser.id,
        jerseyNumber: 10,
        preferredPosition: 'Setter',
      });

    await request(app)
      .post(`/api/teams/${teamId}/players`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        playerId: playerResponse.body.data.id,
      });

    const createByAdminResponse = await request(app)
      .post('/api/announcements')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        audienceType: 'team_players',
        teamId,
        title: 'Practice Reminder',
        message: 'Training starts at 6 PM tomorrow.',
      });

    expect(createByAdminResponse.statusCode).toBe(201);
    expect(createByAdminResponse.body.success).toBe(true);
    expect(createByAdminResponse.body.data.team_id).toBe(teamId);
    expect(createByAdminResponse.body.data.audience_label).toBe('Tigers');
    expect(createByAdminResponse.body.data.sender.full_name).toBe('Emily Parker');
    expect(createByAdminResponse.body.data.sender.role).toBe('admin');

    const createByCoachResponse = await request(app)
      .post('/api/announcements')
      .set('Authorization', `Bearer ${coachToken}`)
      .send({
        audienceType: 'team_players',
        teamId,
        title: 'Bring Water',
        message: 'Everyone should bring a water bottle.',
      });

    expect(createByCoachResponse.statusCode).toBe(201);
    expect(createByCoachResponse.body.data.created_by).toBeDefined();

    const listResponse = await request(app)
      .get('/api/announcements')
      .set('Authorization', `Bearer ${playerToken}`);

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.body.success).toBe(true);
    expect(listResponse.body.data).toHaveLength(2);
    expect(listResponse.body.data[0].sender).toBeDefined();
    expect(listResponse.body.data[0].sender.role).toBeDefined();

    const announcementId = createByAdminResponse.body.data.id;
    const getResponse = await request(app)
      .get(`/api/announcements/${announcementId}`)
      .set('Authorization', `Bearer ${playerToken}`);

    expect(getResponse.statusCode).toBe(200);
    expect(getResponse.body.data.id).toBe(announcementId);
    expect(getResponse.body.data.team_id).toBe(teamId);
    expect(getResponse.body.data.sender.full_name).toBe('Emily Parker');
    expect(getResponse.body.data.sender.role).toBe('admin');
  });

  test('player cannot create announcements', async () => {
    const adminToken = await login('admin@agriguard.com', 'Admin@123!');
    const playerToken = await login('player@agriguard.com', 'Player@123!');

    const teamResponse = await request(app)
      .post('/api/teams')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Eagles',
        coachUserId: null,
      });

    const response = await request(app)
      .post('/api/announcements')
      .set('Authorization', `Bearer ${playerToken}`)
      .send({
        audienceType: 'team_players',
        teamId: teamResponse.body.data.id,
        title: 'Blocked',
        message: 'This should not be allowed.',
      });

    expect(response.statusCode).toBe(403);
    expect(response.body.success).toBe(false);
  });

  test('announcement creation validates required fields and team scoping', async () => {
    const adminToken = await login('admin@agriguard.com', 'Admin@123!');
    await createSecondActiveAdmin();
    const secondAdminToken = await login('second-admin@example.com', 'StrongPass@123');

    const firstClubTeamResponse = await request(app)
      .post('/api/teams')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Falcons',
        coachUserId: null,
      });

    const missingTeamResponse = await request(app)
      .post('/api/announcements')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        audienceType: 'team_players',
        title: 'Missing Team',
        message: 'This should fail validation.',
      });

    expect(missingTeamResponse.statusCode).toBe(400);
    expect(missingTeamResponse.body.errors.teamId).toBeDefined();

    const crossClubResponse = await request(app)
      .post('/api/announcements')
      .set('Authorization', `Bearer ${secondAdminToken}`)
      .send({
        audienceType: 'team_players',
        teamId: firstClubTeamResponse.body.data.id,
        title: 'Cross Club',
        message: 'This should not be allowed.',
      });

    expect(crossClubResponse.statusCode).toBe(404);
  });

  test('announcement creation triggers in-app notifications for team members', async () => {
    const adminToken = await login('admin@agriguard.com', 'Admin@123!');
    const playerToken = await login('player@agriguard.com', 'Player@123!');

    const teamResponse = await request(app)
      .post('/api/teams')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Sharks',
        coachUserId: null,
      });

    const teamId = teamResponse.body.data.id;

    const usersResponse = await request(app)
      .get('/api/auth/users')
      .set('Authorization', `Bearer ${adminToken}`);

    const playerUser = usersResponse.body.data.find((entry) => entry.email === 'player@agriguard.com');

    const playerResponse = await request(app)
      .post('/api/players')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        userId: playerUser.id,
        jerseyNumber: 8,
        preferredPosition: 'Outside Hitter',
      });

    await request(app)
      .post(`/api/teams/${teamId}/players`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        playerId: playerResponse.body.data.id,
      });

    const createResponse = await request(app)
      .post('/api/announcements')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        audienceType: 'team_players',
        teamId,
        title: 'Bring Jerseys',
        message: 'Please bring your jerseys to Friday practice.',
      });

    expect(createResponse.statusCode).toBe(201);

    const notificationsResponse = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${playerToken}`);

    expect(notificationsResponse.statusCode).toBe(200);
    expect(notificationsResponse.body.data).toHaveLength(1);
    expect(notificationsResponse.body.data[0].type).toBe('announcement_posted');
    expect(notificationsResponse.body.data[0].related_entity_type).toBe('announcement');
    expect(notificationsResponse.body.data[0].related_entity_id).toBe(createResponse.body.data.id);
  });

  test('admin can target all coaches, all players, or all users within their own club', async () => {
    const adminToken = await login('admin@agriguard.com', 'Admin@123!');
    const coachToken = await login('coach@agriguard.com', 'Coach@123!');
    const playerToken = await login('player@agriguard.com', 'Player@123!');

    const coachesResponse = await request(app)
      .post('/api/announcements')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        audienceType: 'all_coaches',
        title: 'Coaches Meeting',
        message: 'All coaches should attend the meeting at 5 PM.',
      });

    expect(coachesResponse.statusCode).toBe(201);
    expect(coachesResponse.body.data.team_id).toBe('');
    expect(coachesResponse.body.data.audience_label).toBe('All coaches');

    const coachNotificationsResponse = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${coachToken}`);

    const playerNotificationsAfterCoachBlast = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${playerToken}`);

    expect(coachNotificationsResponse.body.data).toHaveLength(1);
    expect(coachNotificationsResponse.body.data[0].related_entity_id).toBe(coachesResponse.body.data.id);
    expect(playerNotificationsAfterCoachBlast.body.data).toHaveLength(0);

    const playersResponse = await request(app)
      .post('/api/announcements')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        audienceType: 'all_players',
        title: 'Players Update',
        message: 'All players should review the latest announcement.',
      });

    expect(playersResponse.statusCode).toBe(201);
    expect(playersResponse.body.data.team_id).toBe('');
    expect(playersResponse.body.data.audience_label).toBe('All players');

    const coachNotificationsAfterPlayerBlast = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${coachToken}`);

    const playerNotificationsResponse = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${playerToken}`);

    expect(coachNotificationsAfterPlayerBlast.body.data).toHaveLength(1);
    expect(playerNotificationsResponse.body.data).toHaveLength(1);
    expect(playerNotificationsResponse.body.data[0].related_entity_id).toBe(playersResponse.body.data.id);

    const allUsersResponse = await request(app)
      .post('/api/announcements')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        audienceType: 'all_users',
        title: 'Club-wide update',
        message: 'All players and coaches should review this announcement.',
      });

    expect(allUsersResponse.statusCode).toBe(201);
    expect(allUsersResponse.body.data.team_id).toBe('');
    expect(allUsersResponse.body.data.audience_label).toBe('All users');

    const coachNotificationsAfterAllUsersBlast = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${coachToken}`);

    const playerNotificationsAfterAllUsersBlast = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${playerToken}`);

    expect(coachNotificationsAfterAllUsersBlast.body.data).toHaveLength(2);
    expect(coachNotificationsAfterAllUsersBlast.body.data[0].related_entity_id).toBe(allUsersResponse.body.data.id);
    expect(playerNotificationsAfterAllUsersBlast.body.data).toHaveLength(2);
    expect(playerNotificationsAfterAllUsersBlast.body.data[0].related_entity_id).toBe(allUsersResponse.body.data.id);

    const coachAnnouncementsResponse = await request(app)
      .get('/api/announcements')
      .set('Authorization', `Bearer ${coachToken}`);

    const playerAnnouncementsResponse = await request(app)
      .get('/api/announcements')
      .set('Authorization', `Bearer ${playerToken}`);

    expect(coachAnnouncementsResponse.statusCode).toBe(200);
    expect(coachAnnouncementsResponse.body.data).toHaveLength(2);
    expect(coachAnnouncementsResponse.body.data.some((entry) => entry.id === coachesResponse.body.data.id)).toBe(true);
    expect(coachAnnouncementsResponse.body.data.some((entry) => entry.id === allUsersResponse.body.data.id)).toBe(true);

    expect(playerAnnouncementsResponse.statusCode).toBe(200);
    expect(playerAnnouncementsResponse.body.data).toHaveLength(2);
    expect(playerAnnouncementsResponse.body.data.some((entry) => entry.id === playersResponse.body.data.id)).toBe(true);
    expect(playerAnnouncementsResponse.body.data.some((entry) => entry.id === allUsersResponse.body.data.id)).toBe(true);
  });

  test('coach can only target players on their own team', async () => {
    const adminToken = await login('admin@agriguard.com', 'Admin@123!');
    const coachToken = await login('coach@agriguard.com', 'Coach@123!');

    const teamResponse = await request(app)
      .post('/api/teams')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Tigers',
        coachUserId: null,
      });

    const teamId = teamResponse.body.data.id;

    const usersResponse = await request(app)
      .get('/api/auth/users')
      .set('Authorization', `Bearer ${adminToken}`);

    const coachUser = usersResponse.body.data.find((entry) => entry.email === 'coach@agriguard.com');

    await request(app)
      .patch(`/api/teams/${teamId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        coachUserId: coachUser.id,
      });

    const forbiddenAudienceResponse = await request(app)
      .post('/api/announcements')
      .set('Authorization', `Bearer ${coachToken}`)
      .send({
        audienceType: 'all_players',
        title: 'Blocked Coach Blast',
        message: 'This should fail.',
      });

    expect(forbiddenAudienceResponse.statusCode).toBe(403);
    expect(forbiddenAudienceResponse.body.message).toBe('Coaches can only send announcements to their own team.');

    const allowedResponse = await request(app)
      .post('/api/announcements')
      .set('Authorization', `Bearer ${coachToken}`)
      .send({
        audienceType: 'team_players',
        teamId,
        title: 'Team-only update',
        message: 'This should be allowed.',
      });

    expect(allowedResponse.statusCode).toBe(201);

    const otherTeamResponse = await request(app)
      .post('/api/teams')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Eagles',
        coachUserId: null,
      });

    const crossTeamResponse = await request(app)
      .post('/api/announcements')
      .set('Authorization', `Bearer ${coachToken}`)
      .send({
        audienceType: 'team_players',
        teamId: otherTeamResponse.body.data.id,
        title: 'Wrong Team',
        message: 'This should fail too.',
      });

    expect(crossTeamResponse.statusCode).toBe(403);
    expect(crossTeamResponse.body.message).toBe('You can only send announcements to your own team.');
  });
});
