const env = require('../config/env');
const httpError = require('../utils/httpError');
const { logError, logWarn } = require('../utils/logger');

const OPENAI_CHAT_COMPLETIONS_URL = 'https://api.openai.com/v1/chat/completions';
const ALLOWED_EVENT_TYPES = new Set(['training', 'match', 'meeting', 'other']);

function safeJsonParse(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();

  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (!fenced) return null;
    try {
      return JSON.parse(fenced[1].trim());
    } catch {
      return null;
    }
  }
}

function clampConfidence(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  if (numeric < 0) return 0;
  if (numeric > 1) return 1;
  return Number(numeric.toFixed(2));
}

function normalizeEventType(value) {
  const type = String(value || '')
    .trim()
    .toLowerCase();

  if (!type) return null;
  if (!ALLOWED_EVENT_TYPES.has(type)) return null;
  return type;
}

function normalizeIso(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function normalizeText(value, maxLength = 500) {
  if (!value) return '';
  return String(value).trim().slice(0, maxLength);
}

function hasDateReference(transcript) {
  const text = String(transcript || '').toLowerCase();
  if (!text) return false;

  const relative = /\b(today|tomorrow|tmrw|day after tomorrow|tonight|this morning|this afternoon|this evening)\b/i;
  const weekdays = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;
  const months = /\b(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sep|october|oct|november|nov|december|dec)\b/i;
  const numericDate = /\b\d{1,2}[/-]\d{1,2}([/-]\d{2,4})?\b/;
  const ordinalDay = /\b\d{1,2}(st|nd|rd|th)\b/i;

  return relative.test(text) || weekdays.test(text) || months.test(text) || numericDate.test(text) || ordinalDay.test(text);
}

function hasExplicitTimeReference(transcript) {
  const text = String(transcript || '').toLowerCase();
  if (!text) return false;

  const ampm = /\b\d{1,2}(:\d{2})?\s?(am|pm|a\.m\.|p\.m\.)\b/i;
  const time24 = /\b([01]?\d|2[0-3]):[0-5]\d\b/;
  const noonMidnight = /\b(noon|midnight)\b/i;
  const rangeSimple = /\bfrom\s+\d{1,2}(:\d{2})?\s*(am|pm|a\.m\.|p\.m\.)?\s*(to|-|until|till)\s+\d{1,2}(:\d{2})?\s*(am|pm|a\.m\.|p\.m\.)?\b/i;
  const atSimple = /\b(at|around)\s+\d{1,2}(:\d{2})?\s*(am|pm|a\.m\.|p\.m\.)?\b/i;

  return ampm.test(text) || time24.test(text) || noonMidnight.test(text) || rangeSimple.test(text) || atSimple.test(text);
}

function getZonedParts(date, timezone) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone || 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const map = Object.fromEntries(parts.map((entry) => [entry.type, entry.value]));
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
  };
}

function zonedLocalToUtcIso({ year, month, day, hour, minute }, timezone) {
  let guess = Date.UTC(year, month - 1, day, hour, minute, 0);

  for (let index = 0; index < 4; index += 1) {
    const zoned = getZonedParts(new Date(guess), timezone);
    const desiredAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
    const zonedAsUtc = Date.UTC(zoned.year, zoned.month - 1, zoned.day, zoned.hour, zoned.minute, 0);
    const diff = desiredAsUtc - zonedAsUtc;
    guess += diff;
    if (diff === 0) break;
  }

  return new Date(guess).toISOString();
}

function addDays(year, month, day, days) {
  const date = new Date(Date.UTC(year, month - 1, day + days, 12, 0, 0));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function inferDateFromTranscript(transcript, referenceDate, timezone) {
  const text = String(transcript || '').toLowerCase();
  if (!text) return null;

  const ref = referenceDate ? new Date(referenceDate) : new Date();
  if (Number.isNaN(ref.getTime())) return null;
  const zonedRef = getZonedParts(ref, timezone || 'UTC');

  if (/\btomorrow|tmrw\b/i.test(text)) {
    return addDays(zonedRef.year, zonedRef.month, zonedRef.day, 1);
  }

  if (/\btoday|tonight|this morning|this afternoon|this evening\b/i.test(text)) {
    return { year: zonedRef.year, month: zonedRef.month, day: zonedRef.day };
  }

  return null;
}

function applyTranscriptRules(parsed, transcript, timezone, referenceDate) {
  const next = { ...parsed };
  const hasDate = hasDateReference(transcript);
  const hasTime = hasExplicitTimeReference(transcript);

  if (!hasDate) {
    next.start_time = null;
    next.end_time = null;
    return next;
  }

  if (hasTime) {
    return next;
  }

  const baseIso = next.start_time || next.end_time;
  let localDate = null;

  if (baseIso) {
    const baseDate = new Date(baseIso);
    if (!Number.isNaN(baseDate.getTime())) {
      const zoned = getZonedParts(baseDate, timezone || 'UTC');
      localDate = { year: zoned.year, month: zoned.month, day: zoned.day };
    }
  }

  if (!localDate) {
    localDate = inferDateFromTranscript(transcript, referenceDate, timezone || 'UTC');
  }

  if (!localDate) {
    next.start_time = null;
    next.end_time = null;
    return next;
  }

  const noonIso = zonedLocalToUtcIso(
    {
      year: localDate.year,
      month: localDate.month,
      day: localDate.day,
      hour: 12,
      minute: 0,
    },
    timezone || 'UTC'
  );
  const noonPlusMinuteIso = zonedLocalToUtcIso(
    {
      year: localDate.year,
      month: localDate.month,
      day: localDate.day,
      hour: 12,
      minute: 1,
    },
    timezone || 'UTC'
  );

  next.start_time = noonIso;
  next.end_time = noonPlusMinuteIso;
  return next;
}

function buildSystemPrompt() {
  return [
    'You are an event extraction engine for a crop monitoring platform.',
    'Extract structured fields from a voice transcript.',
    'Return strict JSON only, no markdown or explanations.',
    'Allowed event types: training (field scouting), match (agronomist visit), meeting (advisory call), other.',
    'Set null for unknown or unmentioned fields.',
    'Do not infer, assume, invent, or auto-complete missing information.',
    'Only fill a field when it is explicitly present in the transcript.',
    'All times must be ISO-8601 datetimes in UTC when possible.',
    'Use warnings array for ambiguity or assumptions.',
    'Confidence must be between 0 and 1.',
    'JSON keys required:',
    'title, type, team_id, team_name, start_time, end_time, location, notes, confidence, warnings',
  ].join(' ');
}

function buildUserPrompt(payload) {
  const teamContext = Array.isArray(payload.teams) && payload.teams.length
    ? payload.teams.map((entry) => `- ${entry.id}: ${entry.name}`).join('\n')
    : 'No team list provided.';

  return [
    `Transcript:\n${payload.transcript}`,
    `Timezone hint: ${payload.timezone || 'UTC'}`,
    `Reference datetime for relative phrases: ${payload.referenceDate || new Date().toISOString()}`,
    `Available teams (use exact id when matched):\n${teamContext}`,
  ].join('\n\n');
}

function normalizeParseResult(parsed, transcript) {
  const warnings = Array.isArray(parsed?.warnings)
    ? parsed.warnings.map((entry) => normalizeText(entry, 200)).filter(Boolean)
    : [];

  const normalizedParsed = {
    title: normalizeText(parsed?.title, 100),
    type: normalizeEventType(parsed?.type),
    team_id: normalizeText(parsed?.team_id, 120) || null,
    team_name: normalizeText(parsed?.team_name, 100) || null,
    start_time: normalizeIso(parsed?.start_time),
    end_time: normalizeIso(parsed?.end_time),
    location: normalizeText(parsed?.location, 200),
    notes: normalizeText(parsed?.notes, 500),
  };

  const finalParsed = applyTranscriptRules(
    normalizedParsed,
    transcript,
    parsed?.timezone_hint || 'UTC',
    parsed?.reference_date_hint || null
  );

  return {
    transcript: normalizeText(transcript, 4000),
    parsed: finalParsed,
    confidence: clampConfidence(parsed?.confidence),
    warnings,
  };
}

async function parseEventTranscript(payload) {
  if (!env.openAiApiKey) {
    throw httpError(503, 'NLP parsing service is not configured.');
  }

  let response;
  try {
    response = await fetch(OPENAI_CHAT_COMPLETIONS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.openAiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: env.openAiNlpModel,
        response_format: { type: 'json_object' },
        temperature: 0.1,
        messages: [
          { role: 'system', content: buildSystemPrompt() },
          { role: 'user', content: buildUserPrompt(payload) },
        ],
      }),
    });
  } catch (error) {
    logError('NLP provider request failed', { error: error.message });
    throw httpError(502, 'NLP parsing provider is unavailable right now.');
  }

  const rawBody = await response.text();
  const providerBody = safeJsonParse(rawBody) || {};

  if (!response.ok) {
    logWarn('NLP provider returned an error', { status: response.status, body: rawBody });
    throw httpError(502, 'NLP parsing provider could not process the transcript.');
  }

  const content = providerBody?.choices?.[0]?.message?.content || '';
  const parsedContent = safeJsonParse(content);
  if (!parsedContent) {
    throw httpError(502, 'NLP parsing provider returned an invalid response.');
  }

  return normalizeParseResult(
    {
      ...parsedContent,
      timezone_hint: payload.timezone || 'UTC',
      reference_date_hint: payload.referenceDate || null,
    },
    payload.transcript
  );
}

module.exports = {
  parseEventTranscript,
};
