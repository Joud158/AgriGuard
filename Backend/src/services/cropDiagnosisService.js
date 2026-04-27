const env = require('../config/env');
const httpError = require('../utils/httpError');

const LOCAL_MODEL_PREFIX = 'Local Hugging Face Vision Model';

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
    /high|urgent|severe|spreading|blight|rust|rot|mildew|bacterial|virus|leaf spot|spot|disease|lesion|yellowing|wilting/.test(
      text
    )
  ) {
    return 'High';
  }

  return 'Medium';
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

  let response;

  try {
    console.log('[AI] Calling local AI service:', localAiUrl);

    response = await fetch(localAiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageBase64: image,
        mimeType: payload.mimeType || 'image/jpeg',
        symptoms: payload.question || '',
        crop: payload.crop || '',
      }),
    });
  } catch (error) {
    console.error('[AI] Local AI fetch failed:', {
      url: localAiUrl,
      name: error.name,
      message: error.message,
      cause: error.cause,
    });

    throw httpError(
      502,
      `Could not reach local AI service at ${env.localAiServiceUrl}. Make sure Qwen is running on port 8105.`
    );
  }

  if (!response.ok) {
    const details = await response.text().catch(() => '');

    throw httpError(
      502,
      'Local Hugging Face crop-image service returned an error.',
      {
        providerStatus: response.status,
        providerDetails: details.slice(0, 500),
      }
    );
  }

  const data = await response.json();

  const answer =
    normalize(data.answer) ||
    'The model could not generate a useful crop advisory for this image.';

  const label = normalize(data.label) || 'Visual crop-health advisory';
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