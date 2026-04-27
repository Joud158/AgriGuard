const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET is required. Add a strong secret to your backend .env file.');
}

const emailEnabled = String(process.env.EMAIL_ENABLED || 'false').trim().toLowerCase() === 'true';
const configuredDbPath = (process.env.DB_PATH || '').trim();

module.exports = {
  port: Number(process.env.PORT || 4000),
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  invitationTtlHours: Number(process.env.INVITATION_TTL_HOURS || 72),
  emailVerificationTtlHours: Number(process.env.EMAIL_VERIFICATION_TTL_HOURS || 24),
  passwordResetTtlMinutes: Number(process.env.PASSWORD_RESET_TTL_MINUTES || 30),
  mfaChallengeTtlMinutes: Number(process.env.MFA_CHALLENGE_TTL_MINUTES || 10),
  mfaIssuer: process.env.MFA_ISSUER || 'AgriGuard',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  frontendBaseUrl: process.env.FRONTEND_BASE_URL || process.env.CORS_ORIGIN || 'http://localhost:5173',
  showInvitePreviewLink: String(process.env.SHOW_INVITE_PREVIEW_LINK || 'false').trim().toLowerCase() === 'true',
  showPasswordResetPreviewLink: String(process.env.SHOW_PASSWORD_RESET_PREVIEW_LINK || 'false').trim().toLowerCase() === 'true',

  emailEnabled,
  emailProvider: (process.env.EMAIL_PROVIDER || 'smtp').trim().toLowerCase(),
  smtpHost: process.env.SMTP_HOST || '',
  smtpPort: Number(process.env.SMTP_PORT || 587),
  smtpSecure: String(process.env.SMTP_SECURE || 'false').trim().toLowerCase() === 'true',
  smtpUser: process.env.SMTP_USER || '',
  smtpPass: process.env.SMTP_PASS || '',
  emailFrom: process.env.EMAIL_FROM || '',
  emailReplyTo: process.env.EMAIL_REPLY_TO || '',

  pusherAppId: process.env.PUSHER_APP_ID || '',
  pusherKey: process.env.PUSHER_KEY || '',
  pusherSecret: process.env.PUSHER_SECRET || '',
  pusherCluster: process.env.PUSHER_CLUSTER || '',

  // AI provider settings. Use AI_PROVIDER=local to avoid paid OpenAI calls.
  aiProvider: (process.env.AI_PROVIDER || (process.env.OPENAI_API_KEY ? 'openai' : 'local')).trim().toLowerCase(),
  localAiServiceUrl: process.env.LOCAL_AI_SERVICE_URL || 'http://127.0.0.1:8105',
  localVisionModel: process.env.LOCAL_VISION_MODEL || 'wambugu71/crop_leaf_diseases_vit',
  localVisionModelPath: process.env.LOCAL_VISION_MODEL_PATH || '',
  localTranscriptionModel: process.env.LOCAL_TRANSCRIPTION_MODEL || 'openai/whisper-tiny',
  localNlpMode: process.env.LOCAL_NLP_MODE || 'heuristic',
  openAiApiKey: process.env.OPENAI_API_KEY || '',
  openAiTranscriptionModel: process.env.OPENAI_TRANSCRIPTION_MODEL || 'gpt-4o-mini-transcribe',
  openAiNlpModel: process.env.OPENAI_NLP_MODEL || 'gpt-4o-mini',
  openAiVisionModel: process.env.OPENAI_VISION_MODEL || 'gpt-4.1-mini',

  // Real satellite/weather settings. Sentinel Hub uses Copernicus Data Space credentials.
  satelliteProvider: (process.env.SATELLITE_PROVIDER || 'auto').trim().toLowerCase(),
  sentinelClientId: process.env.SENTINEL_CLIENT_ID || '',
  sentinelClientSecret: process.env.SENTINEL_CLIENT_SECRET || '',
  sentinelTokenUrl:
    process.env.SENTINEL_TOKEN_URL ||
    'https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token',
  sentinelStatsUrl: process.env.SENTINEL_STATS_URL || 'https://sh.dataspace.copernicus.eu/api/v1/statistics',
  satelliteFieldsJson: process.env.SATELLITE_FIELDS_JSON || '',
  nasaPowerEnabled: String(process.env.NASA_POWER_ENABLED || 'true').trim().toLowerCase() === 'true',

  dbPath: configuredDbPath
    ? path.resolve(configuredDbPath)
    : path.join(__dirname, '..', 'data', 'agriguard.sqlite'),
};
