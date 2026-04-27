const http = require('http');
const https = require('https');

const env = require('../config/env');
const httpError = require('../utils/httpError');

const LOCAL_MODEL_PREFIX = 'Local Hugging Face Vision Model';
const AI_TIMEOUT_MS = 20 * 60 * 1000;

function normalize(value) {
  return String(value || '').trim();
}

function stripDataUrl(imageBase64) {
  const raw = normalize(imageBase64);

  if (!raw) return '';

  const commaIndex = raw.indexOf(',');
  return raw.startsWith('data:') && commaIndex !== -1 ? raw.slice(commaIndex + 1) : raw;
}

function severityFromText(value) {
  const text = normalize(value).toLowerCase();

  if (/healthy|no visible disease|minor|normal/.test(text)) {
    return 'Low';
  }

  if (
    /high|urgent|severe|spreading|blight|rust|rot|mildew|bacterial|virus|leaf spot|spot|disease|lesion|yellowing|wilting|fungal|infection/.test(
      text
    )
  ) {
    return 'High';
  }

  return 'Medium';
}

function postJson(urlString, payload) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const body = JSON.stringify(payload);
    const client = url.protocol === 'https:' ? https : http;

    const startedAt = Date.now();

    const request = client.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port,
        path: `${url.pathname}${url.search}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: AI_TIMEOUT_MS,
      },
      (response) => {
        let responseBody = '';

        response.setEncoding('utf8');

        response.on('data', (chunk) => {
          responseBody += chunk;
        });

        response.on('end', () => {
          const elapsedSeconds = Math.round((Date.now() - startedAt) / 1000);

          console.log('[AI] Local AI service responded in seconds:', elapsedSeconds);
          console.log('[AI] Local AI status:', response.statusCode);

          resolve({
            ok: response.statusCode >= 200 && response.statusCode < 300,
            status: response.statusCode,
            body: responseBody,
            elapsedSeconds,
          });
        });
      }
    );

    request.on('timeout', () => {
      const elapsedSeconds = Math.round((Date.now() - startedAt) / 1000);
      request.destroy(
        new Error(`Local AI request timed out after ${elapsedSeconds} seconds.`)
      );
    });

    request.on('error', (error) => {
      const elapsedSeconds = Math.round((Date.now() - startedAt) / 1000);

      console.error('[AI] Local AI HTTP request failed after seconds:', elapsedSeconds);
      console.error('[AI] Local AI HTTP request failed details:', {
        url: urlString,
        name: error.name,
        message: error.message,
        code: error.code,
      });

      reject(error);
    });

    request.write(body);
    request.end();
  });
}

async function localVisionDiagnosis(payload) {
  if (env.aiProvider !== 'local') {
    throw httpError(
      400,
      'AgriGuard is configured to use local Hugging Face vision. Set AI_PROVIDER=local.'
    );
  }

  const image = stripDataUrl(payload.imageBase64);

  if (!image) {
    throw httpError(400, 'Please upload a crop or leaf image first.');
  }

  const localAiUrl = `${env.localAiServiceUrl.replace(/\/$/, '')}/analyze-image`;

  console.log('[AI] Calling local AI service:', localAiUrl);
  console.log('[AI] Image base64 length:', image.length);

  let result;

  try {
    result = await postJson(localAiUrl, {
      imageBase64: image,
      mimeType: payload.mimeType || 'image/jpeg',
      symptoms: payload.question || '',
      crop: payload.crop || '',
    });
  } catch (error) {
    throw httpError(
      502,
      `Local Qwen request failed before a response was returned: ${error.message}`,
      {
        providerUrl: localAiUrl,
        providerError: error.message,
        providerCode: error.code || '',
      }
    );
  }

  if (!result.ok) {
    throw httpError(
      502,
      'Local Hugging Face crop-image service returned an error.',
      {
        providerStatus: result.status,
        providerDetails: result.body.slice(0, 1000),
      }
    );
  }

  let data;

  try {
    data = JSON.parse(result.body);
  } catch {
    throw httpError(502, 'Local AI service returned invalid JSON.', {
      providerDetails: result.body.slice(0, 1000),
    });
  }

  const answer =
    normalize(data.answer) ||
    'The model could not generate a useful crop advisory for this image.';

  const label = normalize(data.label) || 'Qwen visual crop-health advisory';
  const severity = normalize(data.severity) || severityFromText(answer);

  return {
    answer,
    label,
    severity,
    confidence: typeof data.confidence === 'number' ? data.confidence : 0,
    nextSteps: Array.isArray(data.nextSteps) ? data.nextSteps : [],
    interpretationNote:
      normalize(data.interpretationNote) ||
      'This answer is generated from the uploaded image and your question. It is not a confirmed diagnosis. Confirm treatment decisions with an agronomist.',
    modelUsed: `${LOCAL_MODEL_PREFIX}: ${data.model || env.localVisionModel}`,
    usedImage: true,
  };
}

async function analyzeCrop(actor, payload) {
  if (actor.role !== 'player') {
    throw httpError(403, 'Only farmers can upload crop images for diagnosis.');
  }

  if (!normalize(payload.question)) {
    throw httpError(400, 'Please ask a question about the uploaded crop image.');
  }

  return localVisionDiagnosis(payload);
}

module.exports = {
  analyzeCrop,
  LOCAL_MODEL: LOCAL_MODEL_PREFIX,
};