process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key';
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-openai-key';
process.env.OPENAI_NLP_MODEL = process.env.OPENAI_NLP_MODEL || 'gpt-4o-mini';

const request = require('supertest');
const app = require('../src/app');
const { resetDb } = require('../src/data/store');

jest.setTimeout(15000);

beforeEach(async () => {
  await resetDb();
  jest.restoreAllMocks();
});

async function login(email, password) {
  const response = await request(app).post('/api/auth/login').send({ email, password });
  return response.body.data.token;
}

describe('AgriGuard event voice NLP parsing', () => {
  test('coach can parse a transcript into structured event fields', async () => {
    const coachToken = await login('coach@agriguard.com', 'Coach@123!');
    const providerPayload = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              title: 'Falcons Evening Training',
              type: 'training',
              team_id: 'team-1',
              team_name: 'Falcons',
              start_time: '2026-05-02T15:00:00.000Z',
              end_time: '2026-05-02T17:00:00.000Z',
              location: 'Court 2',
              notes: 'Focus on serve receive.',
              confidence: 0.87,
              warnings: [],
            }),
          },
        },
      ],
    };

    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(providerPayload),
    });

    const response = await request(app)
      .post('/api/events/voice/parse')
      .set('Authorization', `Bearer ${coachToken}`)
      .send({
        transcript: 'Falcons training this Saturday at 6 PM in court 2 for two hours.',
        timezone: 'Asia/Beirut',
        teams: [{ id: 'team-1', name: 'Falcons' }],
      });

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.parsed.title).toBe('Falcons Evening Training');
    expect(response.body.data.parsed.type).toBe('training');
    expect(response.body.data.parsed.team_id).toBe('team-1');
    expect(response.body.data.parsed.location).toBe('Court 2');
    expect(response.body.data.confidence).toBe(0.87);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.openai.com/v1/chat/completions');
  });

  test('transcript validation fails when missing', async () => {
    const coachToken = await login('coach@agriguard.com', 'Coach@123!');

    const response = await request(app)
      .post('/api/events/voice/parse')
      .set('Authorization', `Bearer ${coachToken}`)
      .send({
        transcript: '',
      });

    expect(response.statusCode).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toBe('Validation failed');
  });

  test('provider failures return 502', async () => {
    const coachToken = await login('coach@agriguard.com', 'Coach@123!');

    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => JSON.stringify({ error: { message: 'internal' } }),
    });

    const response = await request(app)
      .post('/api/events/voice/parse')
      .set('Authorization', `Bearer ${coachToken}`)
      .send({
        transcript: 'Practice on Monday 5 PM.',
      });

    expect(response.statusCode).toBe(502);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toBe('NLP parsing provider could not process the transcript.');
  });
});
