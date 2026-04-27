import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import DashboardLayout from '../layouts/DashboardLayout';
import Toast from '../components/Toast';

import { useAuth } from '../context/AuthContext';
import { getSatelliteAnalytics } from '../services/authApi';

const LEBANON_CENTER = [33.8938, 35.5018];
let leafletPromise = null;

function loadLeaflet() {
  if (window.L) {
    return Promise.resolve(window.L);
  }

  if (leafletPromise) {
    return leafletPromise;
  }

  leafletPromise = new Promise((resolve, reject) => {
    if (!document.querySelector('link[data-agriguard-leaflet="true"]')) {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      css.dataset.agriguardLeaflet = 'true';
      document.head.appendChild(css);
    }

    const existingScript = document.querySelector('script[data-agriguard-leaflet="true"]');

    if (existingScript) {
      if (window.L) {
        resolve(window.L);
        return;
      }

      existingScript.addEventListener('load', () => resolve(window.L));
      existingScript.addEventListener('error', reject);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.async = true;
    script.dataset.agriguardLeaflet = 'true';
    script.onload = () => resolve(window.L);
    script.onerror = () => reject(new Error('Unable to load the map library.'));
    document.body.appendChild(script);
  });

  return leafletPromise;
}

function formatNdvi(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '—';
  }

  return Number(value).toFixed(3);
}

function formatDrop(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '—';
  }

  const sign = Number(value) > 0 ? '+' : '';
  return `${sign}${Number(value).toFixed(1)}%`;
}

function statusClass(status) {
  const normalized = String(status || '').toLowerCase();

  if (normalized === 'high') return 'high';
  if (normalized === 'medium') return 'medium';

  return 'low';
}

function bboxToLatLngs(bbox) {
  if (!Array.isArray(bbox) || bbox.length !== 4) {
    return [];
  }

  const [minLon, minLat, maxLon, maxLat] = bbox.map(Number);

  if (![minLon, minLat, maxLon, maxLat].every(Number.isFinite)) {
    return [];
  }

  return [
    [minLat, minLon],
    [minLat, maxLon],
    [maxLat, maxLon],
    [maxLat, minLon],
    [minLat, minLon],
  ];
}

function geometryToLatLngs(field) {
  const ring =
    field?.geometry?.coordinates?.[0] ||
    field?.fieldGeometry?.coordinates?.[0] ||
    field?.field_geometry?.coordinates?.[0];

  if (Array.isArray(ring) && ring.length >= 4) {
    return ring
      .map((point) => {
        if (!Array.isArray(point) || point.length < 2) {
          return null;
        }

        const lon = Number(point[0]);
        const lat = Number(point[1]);

        if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
          return null;
        }

        return [lat, lon];
      })
      .filter(Boolean);
  }

  return bboxToLatLngs(field?.bbox || field?.fieldBbox || field?.field_bbox);
}

function drawFieldOnMap({ L, map, layer, field }) {
  if (!L || !map || !layer) {
    return;
  }

  layer.clearLayers();

  if (!field) {
    map.setView(LEBANON_CENTER, 8);
    return;
  }

  const latLngs = geometryToLatLngs(field);

  if (latLngs.length >= 4) {
    const polygon = L.polygon(latLngs, {
      color: '#14532d',
      fillColor: '#22c55e',
      fillOpacity: 0.18,
      weight: 3,
    }).addTo(layer);

    map.fitBounds(polygon.getBounds(), {
      padding: [24, 24],
      maxZoom: 16,
    });
  } else if (field.centroid?.lat && field.centroid?.lon) {
    map.setView([field.centroid.lat, field.centroid.lon], 15);
  }

  if (field.centroid?.lat && field.centroid?.lon) {
    L.marker([field.centroid.lat, field.centroid.lon])
      .addTo(layer)
      .bindPopup(`<strong>${field.name}</strong><br />${field.crop || 'Crop not specified'}`);
  }
}

function SatelliteFieldMap({ field }) {
  const mapNodeRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const leafletRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    loadLeaflet()
      .then((L) => {
        if (cancelled || !mapNodeRef.current || mapRef.current) {
          return;
        }

        leafletRef.current = L;

        const map = L.map(mapNodeRef.current, {
          center: field?.centroid?.lat && field?.centroid?.lon
            ? [field.centroid.lat, field.centroid.lon]
            : LEBANON_CENTER,
          zoom: field ? 14 : 8,
          scrollWheelZoom: false,
        });

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; OpenStreetMap contributors',
        }).addTo(map);

        const layer = L.layerGroup().addTo(map);

        mapRef.current = map;
        layerRef.current = layer;

        drawFieldOnMap({ L, map, layer, field });
        setTimeout(() => map.invalidateSize(), 150);
      })
      .catch(() => {});

    return () => {
      cancelled = true;

      if (mapRef.current) {
        mapRef.current.remove();
      }

      mapRef.current = null;
      layerRef.current = null;
      leafletRef.current = null;
    };
  }, []);

  useEffect(() => {
    drawFieldOnMap({
      L: leafletRef.current,
      map: mapRef.current,
      layer: layerRef.current,
      field,
    });

    if (mapRef.current) {
      setTimeout(() => mapRef.current.invalidateSize(), 120);
    }
  }, [field?.id]);

  return <div ref={mapNodeRef} className="satellite-leaflet-map" />;
}

const emptySummary = {
  fieldsMonitored: 0,
  needInspection: 0,
  highRisk: 0,
  mediumRisk: 0,
  suggestedFollowUpWindow: '—',
  sprayReductionPotential: '—',
};

export default function SatelliteMonitoringPage() {
  const { user } = useAuth();

  const role = user?.role || 'player';
  const isFarmer = role === 'player';

  const [payload, setPayload] = useState({
    summary: emptySummary,
    fields: [],
    configured: false,
    message: '',
  });
  const [selectedFieldId, setSelectedFieldId] = useState('');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('success');
  const [fieldPickerOpen, setFieldPickerOpen] = useState(false);

  async function loadSatelliteAnalytics() {
    setLoading(true);

    const response = await getSatelliteAnalytics();

    if (!response.success) {
      setPayload({
        summary: emptySummary,
        fields: [],
        configured: false,
        message: '',
      });
      setMessageType('error');
      setMessage(response.message || 'Unable to load live Sentinel-2 analytics.');
      setLoading(false);
      return;
    }

    const nextPayload = response.data || {};
    const nextFields = Array.isArray(nextPayload.fields) ? nextPayload.fields : [];

    setPayload({
      summary: nextPayload.summary || emptySummary,
      fields: nextFields,
      configured: Boolean(nextPayload.configured),
      message: nextPayload.message || '',
    });

    setSelectedFieldId((current) => {
      if (current && nextFields.some((field) => field.id === current)) {
        return current;
      }

      return nextFields[0]?.id || '';
    });

    setMessageType(nextFields.length ? 'success' : 'error');
    setMessage(nextPayload.message || (nextFields.length ? 'Live satellite analytics loaded.' : 'No mapped fields available.'));
    setLoading(false);
  }

  useEffect(() => {
    let active = true;

    loadSatelliteAnalytics().catch(() => {
      if (!active) {
        return;
      }

      setPayload({
        summary: emptySummary,
        fields: [],
        configured: false,
        message: '',
      });
      setMessageType('error');
      setMessage('Unable to load live Sentinel-2 analytics right now.');
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, []);

  const fields = useMemo(() => payload.fields || [], [payload.fields]);
  const summary = payload.summary || emptySummary;
  const selectedField = fields.find((field) => field.id === selectedFieldId) || fields[0] || null;

  return (
    <DashboardLayout role={role}>
      <section className="page-head compact satellite-page-head">
        <div>
          <span className="hero-eyebrow">Live Sentinel-2 monitoring</span>
          <h1>Satellite Data Analytics</h1>
          <p>
            Review live NDVI statistics, weather-risk signals, and the mapped boundary for the selected field.
          </p>
        </div>

        <div className="satellite-head-actions">
          <button type="button" className="secondary-button" onClick={loadSatelliteAnalytics}>
            Refresh
          </button>

          {isFarmer ? (
            <Link className="secondary-button" to="/diagnosis">
              Ask AI Crop Doctor
            </Link>
          ) : null}
        </div>
      </section>

      {loading ? (
        <p className="loading-text">Loading live satellite analytics...</p>
      ) : (
        <>
          <section className="metric-grid four-up satellite-live-summary">
            <article className="metric-card">
              <div>
                <div className="metric-title">Fields monitored</div>
                <div className="metric-value">{summary.fieldsMonitored}</div>
              </div>
            </article>

            <article className="metric-card">
              <div>
                <div className="metric-title">Need inspection</div>
                <div className="metric-value">{summary.needInspection}</div>
              </div>
            </article>

            <article className="metric-card">
              <div>
                <div className="metric-title">High risk</div>
                <div className="metric-value">{summary.highRisk}</div>
              </div>
            </article>

            <article className="metric-card">
              <div>
                <div className="metric-title">Follow-up window</div>
                <div className="metric-value text-metric">{summary.suggestedFollowUpWindow}</div>
              </div>
            </article>
          </section>

          <section className="dashboard-card satellite-field-dashboard">
            <div className="section-row satellite-control-row">
              <div>
                <h2>Field Satellite View</h2>
                <p>
                  {isFarmer
                    ? 'Your assigned mapped field loads automatically. Use the selector if more than one field is assigned to you.'
                    : 'Choose a mapped field to inspect its live Sentinel-2 signals.'}
                </p>
              </div>

              {fields.length > 0 ? (
                <label className="satellite-field-select-wrap">
                  <span>Choose field</span>
                  <select
                    className="input satellite-field-select"
                    value={selectedField?.id || ''}
                    onChange={(event) => setSelectedFieldId(event.target.value)}
                  >
                    {fields.map((field) => (
                      <option key={field.id} value={field.id}>
                        {field.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>

            {fields.length === 0 ? (
              <div className="teams-note-card compact">
                <strong>No mapped fields available</strong>
                <p>
                  {isFarmer
                    ? 'This farmer account is not assigned to any mapped field yet. Ask the administrator to add the farmer to a field with a saved boundary.'
                    : 'Go to Farmers & Fields, click Set Boundary for a field, select at least 3 points on the map, and save. The mapped field will appear here after refresh.'}
                </p>
              </div>
            ) : selectedField ? (
              <div className="satellite-selected-grid">
                <div className="satellite-map-card">
                  <div className="satellite-map-card-head">
                    <div>
                      <h3>{selectedField.name}</h3>
                      <p>{selectedField.crop || 'Crop not specified'}</p>
                    </div>

                    <span className={`risk-chip ${statusClass(selectedField.status)}`}>
                      {selectedField.status || 'Low'}
                    </span>
                  </div>

                  {selectedField.previewImage ? (
                    <img
                      src={selectedField.previewImage}
                      alt={`Sentinel-2 NDVI preview for ${selectedField.name}`}
                      className="satellite-preview-image"
                    />
                  ) : null}

                  <SatelliteFieldMap field={selectedField} />
                </div>

                <div className="satellite-selected-card">
                  <h3>Live field readings</h3>

                  <div className="satellite-reading-grid">
                    <div>
                      <span>Current NDVI</span>
                      <strong>{formatNdvi(selectedField.currentNdvi)}</strong>
                    </div>

                    <div>
                      <span>Previous NDVI</span>
                      <strong>{formatNdvi(selectedField.previousNdvi)}</strong>
                    </div>

                    <div>
                      <span>NDVI change</span>
                      <strong>{formatDrop(selectedField.ndviDropPct)}</strong>
                    </div>

                    <div>
                      <span>Weather signal</span>
                      <strong>{selectedField.weather?.notes || 'Unavailable'}</strong>
                    </div>
                  </div>

                  <div className="satellite-recommendation-box">
                    <strong>{selectedField.likelyCause}</strong>
                    <p>{selectedField.recommendation}</p>

                    {Array.isArray(selectedField.reasons) && selectedField.reasons.length ? (
                      <p>Reason: {selectedField.reasons.join(', ')}</p>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}
          </section>

          {fieldPickerOpen ? (
            <div className="modal-overlay" onClick={() => setFieldPickerOpen(false)}>
              <section className="modal-card large-modal-card" onClick={(event) => event.stopPropagation()}>
                <h2>Choose Field</h2>
                <p className="subtle-copy">Select the mapped field you want to inspect.</p>

                <div className="satellite-field-picker-list">
                  {fields.map((field) => (
                    <button
                      key={field.id}
                      type="button"
                      className={
                        field.id === selectedField?.id
                          ? 'satellite-field-picker-row active'
                          : 'satellite-field-picker-row'
                      }
                      onClick={() => {
                        setSelectedFieldId(field.id);
                        setFieldPickerOpen(false);
                      }}
                    >
                      <strong>{field.name}</strong>
                      <span>{field.crop || 'Crop not specified'}</span>
                    </button>
                  ))}
                </div>

                <div className="modal-actions">
                  <button type="button" className="secondary-button" onClick={() => setFieldPickerOpen(false)}>
                    Close
                  </button>
                </div>
              </section>
            </div>
          ) : null}
        </>
      )}

      <Toast message={message} variant={messageType} />
    </DashboardLayout>
  );
}
