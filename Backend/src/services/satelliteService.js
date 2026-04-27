const env = require('../config/env');
const { readDb } = require('../data/store');
const httpError = require('../utils/httpError');

const SATELLITE_MODEL = 'Sentinel-2 NDVI + NASA POWER Weather Risk v1';
const SENTINEL_PROCESS_URL = 'https://sh.dataspace.copernicus.eu/api/v1/process';

let cachedSentinelToken = null;
let cachedSentinelTokenExpiresAt = 0;

function isoDaysAgo(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  date.setUTCHours(0, 0, 0, 0);
  return date.toISOString();
}

function yyyymmddDaysAgo(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);

  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');

  return `${yyyy}${mm}${dd}`;
}

function round(value, digits = 2) {
  if (!Number.isFinite(value)) return null;

  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function hasSentinelCredentials() {
  return Boolean(env.sentinelClientId && env.sentinelClientSecret);
}

function requireSentinelCredentials() {
  if (!hasSentinelCredentials()) {
    throw httpError(
      503,
      'Live Sentinel-2 monitoring is not configured. Add SENTINEL_CLIENT_ID and SENTINEL_CLIENT_SECRET to Backend/.env.'
    );
  }
}

function normalizeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeBbox(value) {
  if (!value) return null;

  if (Array.isArray(value)) {
    const parts = value.map(normalizeNumber);
    return parts.length === 4 && parts.every(Number.isFinite) ? parts : null;
  }

  if (typeof value === 'string') {
    const parts = value
      .split(',')
      .map((part) => normalizeNumber(part.trim()))
      .filter((part) => part !== null);

    return parts.length === 4 ? parts : null;
  }

  return null;
}

function normalizeGeometry(value) {
  if (!value || value.type !== 'Polygon' || !Array.isArray(value.coordinates)) {
    return null;
  }

  const ring = Array.isArray(value.coordinates[0]) ? value.coordinates[0] : [];

  const normalizedRing = ring
    .map((point) => {
      if (!Array.isArray(point) || point.length < 2) return null;

      const lon = normalizeNumber(point[0]);
      const lat = normalizeNumber(point[1]);

      if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
      if (lon < -180 || lon > 180 || lat < -90 || lat > 90) return null;

      return [round(lon, 6), round(lat, 6)];
    })
    .filter(Boolean);

  if (normalizedRing.length < 4) {
    return null;
  }

  const first = normalizedRing[0];
  const last = normalizedRing[normalizedRing.length - 1];

  if (first[0] !== last[0] || first[1] !== last[1]) {
    normalizedRing.push([...first]);
  }

  return {
    type: 'Polygon',
    coordinates: [normalizedRing],
  };
}

function geometryFromBbox(bbox) {
  if (!bbox) return null;

  const [minLon, minLat, maxLon, maxLat] = bbox;

  return {
    type: 'Polygon',
    coordinates: [
      [
        [minLon, minLat],
        [maxLon, minLat],
        [maxLon, maxLat],
        [minLon, maxLat],
        [minLon, minLat],
      ],
    ],
  };
}

function bboxCentroid(bbox) {
  if (!bbox) return null;

  const [minLon, minLat, maxLon, maxLat] = bbox;

  return {
    lon: round((minLon + maxLon) / 2, 6),
    lat: round((minLat + maxLat) / 2, 6),
  };
}

function normalizeField(raw, fallbackId = '') {
  const bbox = normalizeBbox(
    raw.bbox ||
      raw.field_bbox ||
      raw.fieldBbox ||
      raw.satellite_bbox ||
      raw.satelliteBbox ||
      raw.coordinates ||
      raw.boundary_bbox ||
      raw.boundaryBbox
  );

  if (!bbox) return null;

  const fieldGeometry =
    normalizeGeometry(
      raw.field_geometry ||
        raw.fieldGeometry ||
        raw.geometry ||
        raw.boundary_geometry ||
        raw.boundaryGeometry
    ) || geometryFromBbox(bbox);

  const fallbackCentroid = bboxCentroid(bbox);
  const centroid =
    raw.field_centroid || raw.fieldCentroid || raw.centroid || fallbackCentroid;

  const lon = normalizeNumber(
    centroid?.lon ?? centroid?.lng ?? raw.longitude ?? raw.lon
  );
  const lat = normalizeNumber(centroid?.lat ?? raw.latitude ?? raw.lat);

  return {
    id: String(
      raw.id || fallbackId || `field-${Math.random().toString(36).slice(2)}`
    ),
    name: String(raw.name || raw.title || 'Configured field'),
    crop: String(raw.crop || raw.crop_type || raw.cropType || 'Crop not specified'),
    bbox,
    geometry: fieldGeometry,
    centroid: {
      lon: lon ?? fallbackCentroid.lon,
      lat: lat ?? fallbackCentroid.lat,
    },
  };
}

function getFarmerTeamIds(db, actor) {
  const players = Array.isArray(db.players) ? db.players : [];
  const memberships = Array.isArray(db.team_memberships)
    ? db.team_memberships
    : [];

  const playerRecord = players.find(
    (entry) => entry.club_id === actor.clubId && entry.user_id === actor.id
  );

  if (!playerRecord) return new Set();

  return new Set(
    memberships
      .filter((entry) => entry.player_id === playerRecord.id)
      .map((entry) => entry.team_id)
  );
}

function parseFieldsFromDb(db, actor) {
  const teams = Array.isArray(db.teams) ? db.teams : [];
  const farmerTeamIds =
    actor.role === 'player' ? getFarmerTeamIds(db, actor) : null;

  return teams
    .filter((team) => {
      if (team.club_id !== actor.clubId) return false;
      if (actor.role === 'coach') return team.coach_user_id === actor.id;
      if (actor.role === 'player') return farmerTeamIds.has(team.id);
      return true;
    })
    .map((team) =>
      normalizeField({
        ...team,
        crop: team.crop || team.crop_type || team.cropType,
        bbox:
          team.field_bbox ||
          team.fieldBbox ||
          team.bbox ||
          team.satellite_bbox ||
          team.satelliteBbox ||
          team.boundary_bbox,
        geometry: team.field_geometry || team.fieldGeometry || team.geometry,
        centroid: team.field_centroid || team.fieldCentroid || team.centroid,
      })
    )
    .filter(Boolean);
}

async function getConfiguredFields(actor) {
  const db = await readDb();
  return parseFieldsFromDb(db, actor);
}

async function getSentinelToken() {
  requireSentinelCredentials();

  if (
    cachedSentinelToken &&
    Date.now() < cachedSentinelTokenExpiresAt - 60_000
  ) {
    return cachedSentinelToken;
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: env.sentinelClientId,
    client_secret: env.sentinelClientSecret,
  });

  const response = await fetch(env.sentinelTokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  if (!response.ok) {
    const details = await response.text().catch(() => '');

    throw httpError(502, 'Could not authenticate with Sentinel Hub.', {
      providerStatus: response.status,
      providerDetails: details.slice(0, 1000),
    });
  }

  const json = await response.json();

  cachedSentinelToken = json.access_token;
  cachedSentinelTokenExpiresAt =
    Date.now() + Number(json.expires_in || 300) * 1000;

  return cachedSentinelToken;
}

function getNdviEvalscript() {
  return `//VERSION=3
function setup() {
  return {
    input: [{
      bands: ["B04", "B08", "dataMask"]
    }],
    output: [
      {
        id: "ndvi",
        bands: 1,
        sampleType: "FLOAT32"
      },
      {
        id: "dataMask",
        bands: 1
      }
    ]
  };
}

function evaluatePixel(sample) {
  var denominator = sample.B08 + sample.B04;
  var ndvi = denominator !== 0 ? (sample.B08 - sample.B04) / denominator : 0;

  return {
    ndvi: [ndvi],
    dataMask: [sample.dataMask]
  };
}`;
}

function getNdviPreviewEvalscript() {
  return `//VERSION=3
function setup() {
  return {
    input: ["B04", "B08", "dataMask"],
    output: { bands: 4 }
  };
}

function evaluatePixel(sample) {
  if (!sample.dataMask || sample.B08 + sample.B04 === 0) {
    return [0, 0, 0, 0];
  }

  var ndvi = (sample.B08 - sample.B04) / (sample.B08 + sample.B04);

  if (ndvi < 0.25) return [0.85, 0.12, 0.12, 1];
  if (ndvi < 0.45) return [0.95, 0.72, 0.18, 1];
  if (ndvi < 0.65) return [0.34, 0.78, 0.32, 1];
  return [0.05, 0.45, 0.20, 1];
}`;
}

function parseNdviMean(statsJson) {
  const data = Array.isArray(statsJson?.data) ? statsJson.data : [];
  const means = [];

  for (const item of data) {
    const mean = item?.outputs?.ndvi?.bands?.B0?.stats?.mean;

    if (Number.isFinite(Number(mean))) {
      means.push(Number(mean));
    }
  }

  if (!means.length) {
    return null;
  }

  return means.reduce((sum, value) => sum + value, 0) / means.length;
}

function buildSentinelBounds(field) {
  if (field.geometry) {
    return {
      geometry: field.geometry,
      properties: {
        crs: 'http://www.opengis.net/def/crs/EPSG/0/4326',
      },
    };
  }

  return {
    bbox: field.bbox,
    properties: {
      crs: 'http://www.opengis.net/def/crs/EPSG/0/4326',
    },
  };
}

async function fetchSentinelNdvi(field, fromIso, toIso, token) {
  const payload = {
    input: {
      bounds: buildSentinelBounds(field),
      data: [
        {
          type: 'sentinel-2-l2a',
          dataFilter: {
            timeRange: {
              from: fromIso,
              to: toIso,
            },
            mosaickingOrder: 'leastCC',
          },
        },
      ],
    },
    aggregation: {
      timeRange: {
        from: fromIso,
        to: toIso,
      },
      aggregationInterval: {
        of: 'P30D',
      },

      // IMPORTANT:
      // Sentinel Hub expects meter units here.
      // Using plain 10 can be interpreted incorrectly and cause
      // "meters per pixel exceeds the limit" errors.
      resx: '0.0001',
      resy: '0.0001',

      evalscript: getNdviEvalscript(),
    },
    calculations: {
      ndvi: {
        statistics: {
          default: {
            percentiles: {
              k: [50],
            },
          },
        },
      },
    },
  };

  const response = await fetch(env.sentinelStatsUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const details = await response.text().catch(() => '');

    console.error('Sentinel Hub statistics request failed:', {
      status: response.status,
      details,
      fieldName: field.name,
      bbox: field.bbox,
      geometry: field.geometry,
    });

    throw httpError(502, 'Sentinel Hub statistics request failed.', {
      providerStatus: response.status,
      providerDetails: details.slice(0, 1000),
    });
  }

  return parseNdviMean(await response.json());
}

async function fetchSentinelNdviPreview(field, fromIso, toIso, token) {
  const processUrl = env.sentinelProcessUrl || SENTINEL_PROCESS_URL;

  const payload = {
    input: {
      bounds: buildSentinelBounds(field),
      data: [
        {
          type: 'sentinel-2-l2a',
          dataFilter: {
            timeRange: {
              from: fromIso,
              to: toIso,
            },
            mosaickingOrder: 'leastCC',
          },
        },
      ],
    },
    output: {
      width: 512,
      height: 512,
      responses: [
        {
          identifier: 'default',
          format: {
            type: 'image/png',
          },
        },
      ],
    },
    evalscript: getNdviPreviewEvalscript(),
  };

  try {
    const response = await fetch(processUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');

    return `data:image/png;base64,${base64}`;
  } catch {
    return null;
  }
}

async function fetchWeatherSignal(field) {
  if (!env.nasaPowerEnabled) return null;

  const start = yyyymmddDaysAgo(7);
  const end = yyyymmddDaysAgo(1);

  const url = new URL('https://power.larc.nasa.gov/api/temporal/daily/point');

  url.searchParams.set('parameters', 'T2M,PRECTOTCORR,RH2M');
  url.searchParams.set('community', 'AG');
  url.searchParams.set('longitude', String(field.centroid.lon));
  url.searchParams.set('latitude', String(field.centroid.lat));
  url.searchParams.set('start', start);
  url.searchParams.set('end', end);
  url.searchParams.set('format', 'JSON');

  try {
    const response = await fetch(url);

    if (!response.ok) return null;

    const json = await response.json();
    const params = json?.properties?.parameter || {};

    const average = (series) => {
      const values = Object.values(series || {})
        .map(Number)
        .filter((value) => Number.isFinite(value));

      if (!values.length) return null;

      return values.reduce((sum, value) => sum + value, 0) / values.length;
    };

    const temperatureC = average(params.T2M);
    const rainfallMm = average(params.PRECTOTCORR);
    const humidityPct = average(params.RH2M);

    const notes = [];

    if (Number.isFinite(temperatureC) && temperatureC >= 30) {
      notes.push('heat pressure');
    }

    if (Number.isFinite(rainfallMm) && rainfallMm < 0.4) {
      notes.push('low recent rainfall');
    }

    if (Number.isFinite(humidityPct) && humidityPct >= 75) {
      notes.push('humidity disease risk');
    }

    return {
      temperatureC: round(temperatureC, 1),
      rainfallMm: round(rainfallMm, 2),
      humidityPct: round(humidityPct, 1),
      notes: notes.length ? notes.join(', ') : 'weather stable',
    };
  } catch {
    return null;
  }
}

function interpretField({ field, currentNdvi, previousNdvi, weather, previewImage }) {
  const ndviDropPct =
    Number.isFinite(currentNdvi) &&
    Number.isFinite(previousNdvi) &&
    previousNdvi > 0
      ? ((currentNdvi - previousNdvi) / previousNdvi) * 100
      : null;

  let status = 'Low';
  const reasons = [];

  if (Number.isFinite(currentNdvi) && currentNdvi < 0.38) {
    status = 'High';
    reasons.push('low current NDVI');
  } else if (Number.isFinite(currentNdvi) && currentNdvi < 0.5) {
    status = 'Medium';
    reasons.push('moderate current NDVI');
  }

  if (Number.isFinite(ndviDropPct) && ndviDropPct <= -25) {
    status = 'High';
    reasons.push('sharp NDVI drop');
  } else if (
    Number.isFinite(ndviDropPct) &&
    ndviDropPct <= -12 &&
    status !== 'High'
  ) {
    status = 'Medium';
    reasons.push('meaningful NDVI decline');
  }

  if (weather?.notes && weather.notes !== 'weather stable') {
    reasons.push(weather.notes);
  }

  const likelyCause =
    status === 'High'
      ? 'Abnormal vegetation stress requiring inspection'
      : status === 'Medium'
        ? 'Vegetation change to monitor'
        : 'Stable vegetation signal';

  const recommendation =
    status === 'High'
      ? 'Inspect the field as soon as possible and compare stressed zones with healthy rows.'
      : status === 'Medium'
        ? 'Schedule targeted scouting and continue monitoring NDVI movement.'
        : 'Continue routine monitoring.';

  return {
    id: field.id,
    name: field.name,
    crop: field.crop,
    status,
    currentNdvi: round(currentNdvi, 3),
    previousNdvi: round(previousNdvi, 3),
    ndviDropPct: round(ndviDropPct, 1),
    likelyCause,
    recommendation,
    reasons,
    weather,
    centroid: field.centroid,
    bbox: field.bbox,
    geometry: field.geometry,
    previewImage,
  };
}

async function getRealField(field, token) {
  const currentFrom = isoDaysAgo(35);
  const currentTo = isoDaysAgo(1);
  const previousFrom = isoDaysAgo(75);
  const previousTo = isoDaysAgo(36);

  const [currentNdvi, previousNdvi, weather, previewImage] = await Promise.all([
    fetchSentinelNdvi(field, currentFrom, currentTo, token),
    fetchSentinelNdvi(field, previousFrom, previousTo, token),
    fetchWeatherSignal(field),
    fetchSentinelNdviPreview(field, currentFrom, currentTo, token),
  ]);

  return interpretField({
    field,
    currentNdvi,
    previousNdvi,
    weather,
    previewImage,
  });
}

function buildSummary(fields) {
  const high = fields.filter((field) => field.status === 'High').length;
  const medium = fields.filter((field) => field.status === 'Medium').length;

  return {
    mode: 'live',
    model: SATELLITE_MODEL,
    provider: 'Copernicus Sentinel Hub + NASA POWER',
    fieldsMonitored: fields.length,
    needInspection: high + medium,
    highRisk: high,
    mediumRisk: medium,
    suggestedFollowUpWindow:
      high > 0 ? '24–48 hours' : medium > 0 ? 'This week' : 'Routine',
    sprayReductionPotential:
      high + medium > 0
        ? 'Use targeted scouting before spraying'
        : 'No spraying indicated from satellite signal',
  };
}

async function getSatelliteAnalytics(actor) {
  if (env.satelliteProvider === 'demo') {
    throw httpError(
      400,
      'Demo satellite mode has been removed. Set SATELLITE_PROVIDER=sentinel_hub.'
    );
  }

  requireSentinelCredentials();

  const fieldsToMonitor = await getConfiguredFields(actor);
  const token = await getSentinelToken();

  if (!fieldsToMonitor.length) {
    return {
      summary: buildSummary([]),
      fields: [],
      configured: true,
      message:
        actor.role === 'player'
          ? 'Live Sentinel-2 connection is active, but this farmer is not assigned to any mapped field yet.'
          : 'Live Sentinel-2 connection is active, but no mapped fields are configured yet. Create a field from Farmers & Fields, draw its boundary on the map, then refresh this page.',
    };
  }

  const fields = await Promise.all(
    fieldsToMonitor.map((field) => getRealField(field, token))
  );

  return {
    summary: buildSummary(fields),
    fields,
    configured: true,
    message: 'Live Sentinel-2 NDVI and NASA POWER weather signals loaded.',
  };
}

module.exports = {
  getSatelliteAnalytics,
  SATELLITE_MODEL,
};