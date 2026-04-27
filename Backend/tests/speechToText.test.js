process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key';
process.env.OPENAI_API_KEY = 'test-openai-key';
process.env.OPENAI_TRANSCRIPTION_MODEL = 'gpt-4o-mini-transcribe';

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

describe('AgriGuard speech-to-text integration', () => {
  test('coach can submit audio for transcription', async () => {
    const coachToken = await login('coach@agriguard.com', 'Coach@123!');
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          text: 'Training tomorrow at 6 PM in Court 2.',
          language: 'en',
          model: 'gpt-4o-mini-transcribe',
          duration: 4.5,
        }),
    });

    const response = await request(app)
      .post('/api/events/voice/transcribe')
      .set('Authorization', `Bearer ${coachToken}`)
      .send({
        audioBase64: Buffer.from('fake-webm-audio').toString('base64'),
        mimeType: 'audio/webm',
        fileName: 'voice-note.webm',
        language: 'en',
      });

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.transcript).toBe('Training tomorrow at 6 PM in Court 2.');
    expect(response.body.data.language).toBe('en');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.openai.com/v1/audio/transcriptions');
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer test-openai-key');
  });

  test('unsupported audio type is rejected before calling provider', async () => {
    const coachToken = await login('coach@agriguard.com', 'Coach@123!');
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ text: 'should not run' }),
    });

    const response = await request(app)
      .post('/api/events/voice/transcribe')
      .set('Authorization', `Bearer ${coachToken}`)
      .send({
        audioBase64: Buffer.from('fake-audio').toString('base64'),
        mimeType: 'audio/ogg',
      });

    expect(response.statusCode).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toBe(
      'Unsupported audio type. Use mp3, mp4, mpga, m4a, wav, or webm audio.'
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('provider failures are surfaced as gateway errors', async () => {
    const coachToken = await login('coach@agriguard.com', 'Coach@123!');
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => JSON.stringify({ error: { message: 'provider failure' } }),
    });

    const response = await request(app)
      .post('/api/events/voice/transcribe')
      .set('Authorization', `Bearer ${coachToken}`)
      .send({
        audioBase64: Buffer.from('fake-audio').toString('base64'),
        mimeType: 'audio/webm',
      });

    expect(response.statusCode).toBe(502);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toBe('Speech-to-text provider could not transcribe the audio.');
  });
});
