process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key';
process.env.EMAIL_ENABLED = 'false';

const request = require('supertest');
const app = require('../src/app');
const { readDb, resetDb } = require('../src/data/store');

jest.setTimeout(15000);

beforeEach(async () => {
  await resetDb();
});

async function login(email, password) {
  const response = await request(app).post('/api/auth/login').send({ email, password });
  return response.body.data.token;
}

async function listUsers(token) {
  const response = await request(app)
    .get('/api/auth/users')
    .set('Authorization', `Bearer ${token}`);

  return response.body.data;
}

async function createTeam(adminToken, payload) {
  return request(app)
    .post('/api/teams')
    .set('Authorization', `Bearer ${adminToken}`)
    .send(payload);
}

async function createOfficialEvent(adminToken, payload) {
  return request(app)
    .post('/api/events')
    .set('Authorization', `Bearer ${adminToken}`)
    .send(payload);
}

async function listNotifications(token) {
  const response = await request(app)
    .get('/api/notifications')
    .set('Authorization', `Bearer ${token}`);

  return response.body.data;
}

describe('AgriGuard event request workflow', () => {
  test('coach request shows overlap warnings, admin can suggest a change, and coach can accept it', async () => {
    const adminToken = await login('admin@agriguard.com', 'Admin@123!');
    const coachToken = await login('coach@agriguard.com', 'Coach@123!');

    const users = await listUsers(adminToken);
    const adminUser = users.find((entry) => entry.role === 'admin');
    const coachUser = users.find((entry) => entry.role === 'coach');

    const coachedTeamResponse = await createTeam(adminToken, {
      name: 'Falcons',
      coachUserId: coachUser.id,
    });
    const otherTeamResponse = await createTeam(adminToken, {
      name: 'Rockets',
      coachUserId: null,
    });

    await createOfficialEvent(adminToken, {
      teamId: otherTeamResponse.body.data.id,
      title: 'Rockets Session',
      type: 'training',
      description: 'Existing calendar event.',
      location: 'Court 3',
      startTime: '2026-05-05T10:00:00.000Z',
      endTime: '2026-05-05T12:00:00.000Z',
    });

    const createRequestResponse = await request(app)
      .post('/api/event-requests')
      .set('Authorization', `Bearer ${coachToken}`)
      .send({
        teamId: coachedTeamResponse.body.data.id,
        title: 'Morning Scrimmage',
        type: 'training',
        location: 'Court 1',
        notes: 'Need extra balls.',
        startTime: '2026-05-05T10:30:00.000Z',
        endTime: '2026-05-05T11:30:00.000Z',
      });

    expect(createRequestResponse.statusCode).toBe(201);
    expect(createRequestResponse.body.data.status).toBe('pending_admin_review');
    expect(createRequestResponse.body.data.overlap_warnings).toHaveLength(1);
    expect(createRequestResponse.body.data.revisions).toHaveLength(1);
    expect(createRequestResponse.body.data.revisions[0].proposed_by_role).toBe('coach');

    const adminNotificationsAfterSubmit = await listNotifications(adminToken);

    expect(adminNotificationsAfterSubmit).toHaveLength(1);
    expect(adminNotificationsAfterSubmit[0].type).toBe('event_request_submitted');
    expect(adminNotificationsAfterSubmit[0].related_entity_type).toBe('event_request');
    expect(adminNotificationsAfterSubmit[0].related_entity_id).toBe(createRequestResponse.body.data.id);

    const listResponse = await request(app)
      .get('/api/event-requests')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.body.data).toHaveLength(1);
    expect(listResponse.body.data[0].overlap_warning_count).toBe(1);
    expect(listResponse.body.data[0].can_admin_review).toBe(true);

    const suggestResponse = await request(app)
      .patch(`/api/event-requests/${createRequestResponse.body.data.id}/suggest-modification`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Morning Scrimmage Updated',
        type: 'training',
        location: 'Court 2',
        notes: 'Moved to a free slot.',
        startTime: '2026-05-05T12:30:00.000Z',
        endTime: '2026-05-05T13:30:00.000Z',
        comment: 'Shifted to avoid the overlap.',
      });

    expect(suggestResponse.statusCode).toBe(200);
    expect(suggestResponse.body.data.status).toBe('pending_coach_review');
    expect(suggestResponse.body.data.revisions).toHaveLength(2);
    expect(suggestResponse.body.data.revisions[1].proposed_by_role).toBe('admin');

    const coachNotificationsAfterSuggestion = await listNotifications(coachToken);

    expect(coachNotificationsAfterSuggestion).toHaveLength(1);
    expect(coachNotificationsAfterSuggestion[0].type).toBe(
      'event_request_modification_suggested'
    );
    expect(coachNotificationsAfterSuggestion[0].related_entity_type).toBe('event_request');
    expect(coachNotificationsAfterSuggestion[0].related_entity_id).toBe(createRequestResponse.body.data.id);

    const acceptResponse = await request(app)
      .patch(`/api/event-requests/${createRequestResponse.body.data.id}/accept-suggestion`)
      .set('Authorization', `Bearer ${coachToken}`)
      .send({});

    expect(acceptResponse.statusCode).toBe(200);
    expect(acceptResponse.body.data.status).toBe('approved');
    expect(acceptResponse.body.data.finalized_event_id).toBeTruthy();
    expect(acceptResponse.body.data.final_reviewed_by_admin_id).toBe(adminUser.id);

    const db = await readDb();
    const createdEvent = db.events.find(
      (entry) => entry.id === acceptResponse.body.data.finalized_event_id
    );

    expect(createdEvent).toBeTruthy();
    expect(createdEvent.title).toBe('Morning Scrimmage Updated');
    expect(createdEvent.location).toBe('Court 2');

    const coachEventsResponse = await request(app)
      .get('/api/events')
      .set('Authorization', `Bearer ${coachToken}`);

    expect(coachEventsResponse.statusCode).toBe(200);
    expect(
      coachEventsResponse.body.data.some(
        (entry) => entry.id === acceptResponse.body.data.finalized_event_id
      )
    ).toBe(true);
  });

  test('coach can revise an admin proposal and admin can approve the final revision', async () => {
    const adminToken = await login('admin@agriguard.com', 'Admin@123!');
    const coachToken = await login('coach@agriguard.com', 'Coach@123!');

    const users = await listUsers(adminToken);
    const coachUser = users.find((entry) => entry.role === 'coach');

    const teamResponse = await createTeam(adminToken, {
      name: 'Sharks',
      coachUserId: coachUser.id,
    });

    const createRequestResponse = await request(app)
      .post('/api/event-requests')
      .set('Authorization', `Bearer ${coachToken}`)
      .send({
        teamId: teamResponse.body.data.id,
        title: 'Video Review',
        type: 'meeting',
        location: 'Room A',
        notes: 'Initial draft.',
        startTime: '2026-06-06T15:00:00.000Z',
        endTime: '2026-06-06T16:00:00.000Z',
      });

    expect(createRequestResponse.statusCode).toBe(201);

    const requestId = createRequestResponse.body.data.id;

    const suggestResponse = await request(app)
      .patch(`/api/event-requests/${requestId}/suggest-modification`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Video Review - Updated',
        type: 'meeting',
        location: 'Room B',
        notes: 'Try the larger room.',
        startTime: '2026-06-06T16:00:00.000Z',
        endTime: '2026-06-06T17:00:00.000Z',
        comment: 'Please review this adjusted slot.',
      });

    expect(suggestResponse.statusCode).toBe(200);
    expect(suggestResponse.body.data.status).toBe('pending_coach_review');

    const reviseResponse = await request(app)
      .patch(`/api/event-requests/${requestId}/revise`)
      .set('Authorization', `Bearer ${coachToken}`)
      .send({
        title: 'Final Video Review',
        type: 'meeting',
        location: 'Room C',
        notes: 'Coach proposed the final revision.',
        startTime: '2026-06-06T17:00:00.000Z',
        endTime: '2026-06-06T18:00:00.000Z',
        comment: 'This timing works for the squad.',
      });

    expect(reviseResponse.statusCode).toBe(200);
    expect(reviseResponse.body.data.status).toBe('pending_admin_review');
    expect(reviseResponse.body.data.revisions).toHaveLength(3);
    expect(reviseResponse.body.data.revisions[2].proposed_by_role).toBe('coach');

    const adminNotificationsAfterRevision = await listNotifications(adminToken);

    expect(adminNotificationsAfterRevision).toHaveLength(2);
    expect(adminNotificationsAfterRevision[0].type).toBe('event_request_revised');
    expect(adminNotificationsAfterRevision[0].related_entity_type).toBe('event_request');
    expect(adminNotificationsAfterRevision[0].related_entity_id).toBe(requestId);
    expect(adminNotificationsAfterRevision[1].type).toBe('event_request_submitted');

    const approveResponse = await request(app)
      .patch(`/api/event-requests/${requestId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});

    expect(approveResponse.statusCode).toBe(200);
    expect(approveResponse.body.data.status).toBe('approved');
    expect(approveResponse.body.data.finalized_event_id).toBeTruthy();

    const db = await readDb();
    const createdEvent = db.events.find(
      (entry) => entry.id === approveResponse.body.data.finalized_event_id
    );

    expect(createdEvent).toBeTruthy();
    expect(createdEvent.title).toBe('Final Video Review');
    expect(createdEvent.location).toBe('Room C');

    const coachNotificationsAfterApproval = await listNotifications(coachToken);

    expect(coachNotificationsAfterApproval[0].type).toBe('event_request_approved');
    expect(coachNotificationsAfterApproval[0].related_entity_type).toBe('event_request');
    expect(coachNotificationsAfterApproval[0].related_entity_id).toBe(requestId);
    expect(
      coachNotificationsAfterApproval.some((entry) => entry.type === 'event_created')
    ).toBe(false);
  });

  test('coach cannot submit an event request for a team they do not coach', async () => {
    const adminToken = await login('admin@agriguard.com', 'Admin@123!');
    const coachToken = await login('coach@agriguard.com', 'Coach@123!');

    const foreignTeamResponse = await createTeam(adminToken, {
      name: 'Comets',
      coachUserId: null,
    });

    const createRequestResponse = await request(app)
      .post('/api/event-requests')
      .set('Authorization', `Bearer ${coachToken}`)
      .send({
        teamId: foreignTeamResponse.body.data.id,
        title: 'Blocked Request',
        type: 'training',
        location: 'Court 4',
        notes: 'Should fail.',
        startTime: '2026-07-01T08:00:00.000Z',
        endTime: '2026-07-01T09:00:00.000Z',
      });

    expect(createRequestResponse.statusCode).toBe(403);
    expect(createRequestResponse.body.message).toBe(
      'You can only submit requests for teams assigned to you.'
    );
  });

  test('coach can request edits to an official team event and admin approval updates that event in place', async () => {
    const adminToken = await login('admin@agriguard.com', 'Admin@123!');
    const coachToken = await login('coach@agriguard.com', 'Coach@123!');

    const users = await listUsers(adminToken);
    const coachUser = users.find((entry) => entry.role === 'coach');

    const teamResponse = await createTeam(adminToken, {
      name: 'Bulls',
      coachUserId: coachUser.id,
    });

    const eventResponse = await createOfficialEvent(adminToken, {
      teamId: teamResponse.body.data.id,
      title: 'Confirmed Practice',
      type: 'training',
      description: 'Original schedule.',
      location: 'Court 1',
      startTime: '2026-08-03T08:00:00.000Z',
      endTime: '2026-08-03T10:00:00.000Z',
    });

    expect(eventResponse.statusCode).toBe(201);

    const editRequestResponse = await request(app)
      .post('/api/event-requests')
      .set('Authorization', `Bearer ${coachToken}`)
      .send({
        teamId: teamResponse.body.data.id,
        sourceEventId: eventResponse.body.data.id,
        title: 'Confirmed Practice Updated',
        type: 'training',
        location: 'Court 2',
        notes: 'Please shift the session forward.',
        startTime: '2026-08-03T09:00:00.000Z',
        endTime: '2026-08-03T11:00:00.000Z',
      });

    expect(editRequestResponse.statusCode).toBe(201);
    expect(editRequestResponse.body.data.request_kind).toBe('edit');
    expect(editRequestResponse.body.data.source_event_id).toBe(eventResponse.body.data.id);
    expect(editRequestResponse.body.data.overlap_warnings).toHaveLength(0);

    const approveResponse = await request(app)
      .patch(`/api/event-requests/${editRequestResponse.body.data.id}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});

    expect(approveResponse.statusCode).toBe(200);
    expect(approveResponse.body.data.status).toBe('approved');
    expect(approveResponse.body.data.request_kind).toBe('edit');
    expect(approveResponse.body.data.finalized_event_id).toBe(eventResponse.body.data.id);

    const db = await readDb();
    expect(db.events).toHaveLength(1);
    expect(db.events[0].id).toBe(eventResponse.body.data.id);
    expect(db.events[0].title).toBe('Confirmed Practice Updated');
    expect(db.events[0].location).toBe('Court 2');
    expect(db.events[0].start_time).toBe('2026-08-03T09:00:00.000Z');
    expect(db.events[0].end_time).toBe('2026-08-03T11:00:00.000Z');

    const coachNotifications = await listNotifications(coachToken);

    expect(coachNotifications[0].type).toBe('event_request_approved');
    expect(coachNotifications[0].related_entity_type).toBe('event_request');
    expect(
      coachNotifications.some((entry) => entry.type === 'event_updated')
    ).toBe(false);
  });

  test('admin rejection notifies the coach', async () => {
    const adminToken = await login('admin@agriguard.com', 'Admin@123!');
    const coachToken = await login('coach@agriguard.com', 'Coach@123!');

    const users = await listUsers(adminToken);
    const coachUser = users.find((entry) => entry.role === 'coach');

    const teamResponse = await createTeam(adminToken, {
      name: 'Lions',
      coachUserId: coachUser.id,
    });

    const createRequestResponse = await request(app)
      .post('/api/event-requests')
      .set('Authorization', `Bearer ${coachToken}`)
      .send({
        teamId: teamResponse.body.data.id,
        title: 'Late Practice',
        type: 'training',
        location: 'Court 6',
        notes: 'Request that will be rejected.',
        startTime: '2026-07-10T19:00:00.000Z',
        endTime: '2026-07-10T20:00:00.000Z',
      });

    expect(createRequestResponse.statusCode).toBe(201);

    const rejectResponse = await request(app)
      .patch(`/api/event-requests/${createRequestResponse.body.data.id}/reject`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        reason: 'The venue is unavailable at that time.',
      });

    expect(rejectResponse.statusCode).toBe(200);
    expect(rejectResponse.body.data.status).toBe('rejected');

    const coachNotifications = await listNotifications(coachToken);

    expect(coachNotifications).toHaveLength(1);
    expect(coachNotifications[0].type).toBe('event_request_rejected');
    expect(coachNotifications[0].related_entity_type).toBe('event_request');
    expect(coachNotifications[0].related_entity_id).toBe(createRequestResponse.body.data.id);
  });
});
