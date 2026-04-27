const env = require('../config/env');
const httpError = require('../utils/httpError');
const { logError, logWarn } = require('../utils/logger');

const OPENAI_TRANSCRIPTION_URL = 'https://api.openai.com/v1/audio/transcriptions';
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const SUPPORTED_MIME_TYPES = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/mpga',
  'audio/m4a',
  'audio/wav',
  'audio/x-wav',
  'audio/webm',
  'video/mp4',
]);

function normalizeMimeType(mimeType) {
  const raw = String(mimeType || '').trim().toLowerCase();
  if (!raw) return '';
  return raw.split(';')[0].trim();
}

function getFileExtension(mimeType) {
  const normalized = normalizeMimeType(mimeType);
  const extensionMap = {
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'audio/mp4': 'mp4',
    'audio/mpga': 'mpga',
    'audio/m4a': 'm4a',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'audio/webm': 'webm',
    'video/mp4': 'mp4',
  };

  return extensionMap[normalized] || 'webm';
}

function decodeBase64Audio(audioBase64) {
  try {
    return Buffer.from(audioBase64, 'base64');
  } catch {
    throw httpError(400, 'Audio data must be valid base64.');
  }
}

function assertAudioPayload({ audioBase64, mimeType }) {
  if (!env.openAiApiKey) {
    throw httpError(503, 'Speech-to-text service is not configured.');
  }

  if (!audioBase64 || typeof audioBase64 !== 'string') {
    throw httpError(400, 'Audio data is required.');
  }

  const normalizedMimeType = normalizeMimeType(mimeType);
  if (!SUPPORTED_MIME_TYPES.has(normalizedMimeType)) {
    throw httpError(
      400,
      'Unsupported audio type. Use mp3, mp4, mpga, m4a, wav, or webm audio.'
    );
  }

  const audioBuffer = decodeBase64Audio(audioBase64);

  if (!audioBuffer.length) {
    throw httpError(400, 'Audio data is required.');
  }

  if (audioBuffer.length > MAX_AUDIO_BYTES) {
    throw httpError(400, 'Audio file exceeds the 25 MB upload limit.');
  }

  return {
    audioBuffer,
    mimeType: normalizedMimeType,
  };
}

async function transcribeAudio(payload) {
  const { audioBuffer, mimeType } = assertAudioPayload(payload);
  const formData = new FormData();
  const fileName = payload.fileName?.trim() || `voice-note.${getFileExtension(mimeType)}`;
  const audioBlob = new Blob([audioBuffer], { type: mimeType });

  formData.append('file', audioBlob, fileName);
  formData.append('model', env.openAiTranscriptionModel);

  if (payload.language) {
    formData.append('language', payload.language.trim().toLowerCase());
  }

  let response;

  try {
    response = await fetch(OPENAI_TRANSCRIPTION_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.openAiApiKey}`,
      },
      body: formData,
    });
  } catch (error) {
    logError('Speech-to-text provider request failed', { error: error.message });
    throw httpError(502, 'Speech-to-text provider is unavailable right now.');
  }

  const responseText = await response.text();
  let responseJson = {};

  if (responseText) {
    try {
      responseJson = JSON.parse(responseText);
    } catch {
      responseJson = {};
    }
  }

  if (!response.ok) {
    logWarn('Speech-to-text provider returned an error', {
      status: response.status,
      body: responseText,
    });
    throw httpError(502, 'Speech-to-text provider could not transcribe the audio.');
  }

  const transcriptText = String(responseJson.text || '').trim();
  if (!transcriptText) {
    throw httpError(502, 'Speech-to-text provider returned an empty transcript.');
  }

  return {
    transcript: transcriptText,
    language: responseJson.language || payload.language || '',
    model: responseJson.model || env.openAiTranscriptionModel,
    duration_seconds:
      typeof responseJson.duration === 'number' ? responseJson.duration : null,
  };
}

module.exports = {
  MAX_AUDIO_BYTES,
  SUPPORTED_MIME_TYPES,
  transcribeAudio,
};
