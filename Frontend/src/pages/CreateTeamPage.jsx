import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import DashboardLayout from '../layouts/DashboardLayout';
import FormField from '../components/FormField';
import Toast from '../components/Toast';
import {
  createTeam,
  getTeam,
  updateTeamBoundary,
} from '../services/authApi';

const initialValues = {
  name: '',
  crop: '',
};

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

function roundCoordinate(value) {
  return Math.round(Number(value) * 1_000_000) / 1_000_000;
}

function buildGeometry(points) {
  if (points.length < 3) {
    return null;
  }

  const ring = points.map((point) => [
    roundCoordinate(point.lng),
    roundCoordinate(point.lat),
  ]);

  const first = ring[0];
  const last = ring[ring.length - 1];

  if (first[0] !== last[0] || first[1] !== last[1]) {
    ring.push([...first]);
  }

  return {
    type: 'Polygon',
    coordinates: [ring],
  };
}

function buildBbox(points) {
  if (points.length < 3) {
    return null;
  }

  const lngs = points.map((point) => Number(point.lng)).filter(Number.isFinite);
  const lats = points.map((point) => Number(point.lat)).filter(Number.isFinite);

  if (!lngs.length || !lats.length) {
    return null;
  }

  return [
    Math.min(...lngs),
    Math.min(...lats),
    Math.max(...lngs),
    Math.max(...lats),
  ].map(roundCoordinate);
}

function pointsFromGeometry(geometry) {
  const ring = geometry?.coordinates?.[0];

  if (!Array.isArray(ring) || ring.length < 4) {
    return [];
  }

  const points = ring
    .slice(0, -1)
    .map((point) => {
      if (!Array.isArray(point) || point.length < 2) {
        return null;
      }

      const lng = Number(point[0]);
      const lat = Number(point[1]);

      if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
        return null;
      }

      return {
        lat: roundCoordinate(lat),
        lng: roundCoordinate(lng),
      };
    })
    .filter(Boolean);

  return points.length >= 3 ? points : [];
}

function pointsFromBbox(bbox) {
  if (!Array.isArray(bbox) || bbox.length !== 4) {
    return [];
  }

  const [minLng, minLat, maxLng, maxLat] = bbox.map(Number);

  if (![minLng, minLat, maxLng, maxLat].every(Number.isFinite)) {
    return [];
  }

  return [
    { lat: minLat, lng: minLng },
    { lat: minLat, lng: maxLng },
    { lat: maxLat, lng: maxLng },
    { lat: maxLat, lng: minLng },
  ].map((point) => ({
    lat: roundCoordinate(point.lat),
    lng: roundCoordinate(point.lng),
  }));
}

function FieldBoundaryMap({ points, onAddPoint }) {
  const mapNodeRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const leafletRef = useRef(null);
  const clickHandlerRef = useRef(null);
  const fittedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    loadLeaflet()
      .then((L) => {
        if (cancelled || !mapNodeRef.current || mapRef.current) {
          return;
        }

        leafletRef.current = L;

        const map = L.map(mapNodeRef.current, {
          center: LEBANON_CENTER,
          zoom: 8,
          scrollWheelZoom: false,
        });

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; OpenStreetMap contributors',
        }).addTo(map);

        const layer = L.layerGroup().addTo(map);
        const handleMapClick = (event) => {
          onAddPoint({
            lat: roundCoordinate(event.latlng.lat),
            lng: roundCoordinate(event.latlng.lng),
          });
        };

        map.on('click', handleMapClick);
        mapRef.current = map;
        layerRef.current = layer;
        clickHandlerRef.current = handleMapClick;

        setTimeout(() => map.invalidateSize(), 150);
      })
      .catch(() => {});

    return () => {
      cancelled = true;

      if (mapRef.current && clickHandlerRef.current) {
        mapRef.current.off('click', clickHandlerRef.current);
      }

      if (mapRef.current) {
        mapRef.current.remove();
      }

      mapRef.current = null;
      layerRef.current = null;
      leafletRef.current = null;
      clickHandlerRef.current = null;
      fittedRef.current = false;
    };
  }, [onAddPoint]);

  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    const layer = layerRef.current;

    if (!L || !map || !layer) {
      return;
    }

    layer.clearLayers();

    points.forEach((point, index) => {
      L.circleMarker([point.lat, point.lng], {
        radius: 8,
        color: '#ffffff',
        fillColor: '#14532d',
        fillOpacity: 1,
        weight: 2,
      })
        .addTo(layer)
        .bindTooltip(String(index + 1), {
          permanent: true,
          direction: 'center',
          className: 'field-map-point-label',
        });
    });

    if (points.length >= 2) {
      L.polyline(points.map((point) => [point.lat, point.lng]), {
        color: '#166534',
        weight: 3,
      }).addTo(layer);
    }

    if (points.length >= 3) {
      const polygon = L.polygon(points.map((point) => [point.lat, point.lng]), {
        color: '#14532d',
        fillColor: '#22c55e',
        fillOpacity: 0.22,
        weight: 3,
      }).addTo(layer);

      if (!fittedRef.current) {
        map.fitBounds(polygon.getBounds(), {
          padding: [24, 24],
          maxZoom: 17,
        });
        fittedRef.current = true;
      }
    }

    setTimeout(() => map.invalidateSize(), 100);
  }, [points]);

  return <div ref={mapNodeRef} className="field-boundary-map" />;
}

export default function CreateTeamPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const fieldId = searchParams.get('fieldId') || '';
  const isEditMode = Boolean(fieldId);

  const [values, setValues] = useState(initialValues);
  const [boundaryPoints, setBoundaryPoints] = useState([]);
  const [loadingField, setLoadingField] = useState(Boolean(fieldId));
  const [loading, setLoading] = useState(false);
  const [savedField, setSavedField] = useState(null);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('success');

  useEffect(() => {
    let active = true;

    async function loadExistingField() {
      if (!fieldId) {
        setLoadingField(false);
        return;
      }

      const response = await getTeam(fieldId);

      if (!active) {
        return;
      }

      if (!response.success) {
        setMessageType('error');
        setMessage(response.message || 'Unable to load this field.');
        setLoadingField(false);
        return;
      }

      const field = response.data || {};
      const existingPoints = pointsFromGeometry(
        field.fieldGeometry || field.field_geometry || field.geometry
      );
      const fallbackPoints = existingPoints.length >= 3
        ? existingPoints
        : pointsFromBbox(field.fieldBbox || field.field_bbox || field.bbox);

      setValues({
        name: field.name || '',
        crop: field.crop || '',
      });
      setBoundaryPoints(fallbackPoints);
      setLoadingField(false);
    }

    loadExistingField().catch(() => {
      if (!active) {
        return;
      }

      setMessageType('error');
      setMessage('Unable to load this field right now.');
      setLoadingField(false);
    });

    return () => {
      active = false;
    };
  }, [fieldId]);

  const fieldBbox = useMemo(() => buildBbox(boundaryPoints), [boundaryPoints]);
  const fieldGeometry = useMemo(() => buildGeometry(boundaryPoints), [boundaryPoints]);

  const handleAddPoint = useCallback((point) => {
    setBoundaryPoints((current) => [...current, point]);
    setErrors((current) => ({ ...current, fieldBoundary: '' }));
    setMessage('');
  }, []);

  function handleChange(event) {
    const { name, value } = event.target;

    setValues((current) => ({
      ...current,
      [name]: value,
    }));

    setErrors((current) => ({
      ...current,
      [name]: '',
    }));

    setMessage('');
  }

  function validateForm() {
    const nextErrors = {};

    if (!values.name.trim()) {
      nextErrors.name = 'Field name is required.';
    }

    if (boundaryPoints.length < 3 || !fieldBbox || !fieldGeometry) {
      nextErrors.fieldBoundary = 'Click at least 3 points around the field on the map.';
    }

    return nextErrors;
  }

  function handleUndoPoint() {
    setBoundaryPoints((current) => current.slice(0, -1));
    setErrors((current) => ({ ...current, fieldBoundary: '' }));
  }

  function handleClearMap() {
    setBoundaryPoints([]);
    setErrors((current) => ({ ...current, fieldBoundary: '' }));
  }

  function handleClearAll() {
    setValues(initialValues);
    setBoundaryPoints([]);
    setErrors({});
    setMessage('');
    setSavedField(null);
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const nextErrors = validateForm();
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length) {
      return;
    }

    const payload = {
      name: values.name.trim(),
      crop: values.crop.trim(),
      fieldBbox,
      field_bbox: fieldBbox,
      bbox: fieldBbox,
      boundaryBbox: fieldBbox,
      fieldGeometry,
      field_geometry: fieldGeometry,
      geometry: fieldGeometry,
      boundaryGeometry: fieldGeometry,
      boundary: {
        bbox: fieldBbox,
        fieldBbox,
        field_bbox: fieldBbox,
        geometry: fieldGeometry,
        fieldGeometry,
        field_geometry: fieldGeometry,
      },
    };

    setLoading(true);
    setMessage('');

    const response = isEditMode
      ? await updateTeamBoundary(fieldId, payload)
      : await createTeam(payload);

    setLoading(false);

    if (!response.success) {
      setErrors(response.errors ?? {});
      setMessageType('error');
      setMessage(response.message || 'Unable to save this field boundary.');
      return;
    }

    setSavedField(response.data);
    setMessageType('success');
    setMessage(
      isEditMode
        ? 'Boundary saved. Returning to Farmers & Fields...'
        : 'Field created with a saved satellite boundary.'
    );

    if (isEditMode) {
      setTimeout(() => {
        navigate('/teams', { replace: true });
      }, 750);
      return;
    }

    setValues(initialValues);
    setBoundaryPoints([]);
  }

  return (
    <DashboardLayout role="admin">
      <div className="page-head">
        <div>
          <Link className="muted-page-link" to="/teams">
            Back to fields
          </Link>
          <h1>{isEditMode ? 'Set Field Boundary' : 'Create Field'}</h1>
          <p>
            Click points around the farm field. AgriGuard saves the boundary and uses it for live Sentinel-2 NDVI analytics.
          </p>
        </div>
      </div>

      {loadingField ? (
        <p className="loading-text">Loading field map...</p>
      ) : (
        <div className="form-panel invite-panel field-create-panel">
          <form className="stack-form" onSubmit={handleSubmit}>
            <FormField
              label="Field Name"
              name="name"
              placeholder="Example: North Olive Block"
              value={values.name}
              onChange={handleChange}
              error={errors.name}
            />

            <FormField
              label="Crop Type"
              name="crop"
              placeholder="Example: Olives, Tomatoes, Grapes"
              value={values.crop}
              onChange={handleChange}
              error={errors.crop}
            />

            <div className="field-map-card">
              <div className="field-map-head">
                <div>
                  <h2>Draw Field Boundary</h2>
                  <p>
                    Zoom to the farm location and click around the field. The selected polygon is saved and reused in Satellite Data Analytics.
                  </p>
                </div>
                <span className="pill-muted">{boundaryPoints.length} points</span>
              </div>

              <FieldBoundaryMap points={boundaryPoints} onAddPoint={handleAddPoint} />

              {errors.fieldBoundary ? (
                <div className="inline-error">{errors.fieldBoundary}</div>
              ) : null}

              {fieldBbox ? (
                <div className="field-bbox-preview">
                  <strong>Boundary box:</strong>{' '}
                  [{fieldBbox.map((value) => value.toFixed(6)).join(', ')}]
                </div>
              ) : (
                <div className="field-bbox-preview muted">
                  Click the map to start drawing the field boundary.
                </div>
              )}
            </div>

            <div className="action-row">
              <button
                type="button"
                className="secondary-button"
                onClick={handleUndoPoint}
                disabled={boundaryPoints.length === 0 || loading}
              >
                Undo Point
              </button>

              <button
                type="button"
                className="secondary-button"
                onClick={handleClearMap}
                disabled={boundaryPoints.length === 0 || loading}
              >
                Clear Map
              </button>

              {!isEditMode ? (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={handleClearAll}
                  disabled={loading}
                >
                  Clear All
                </button>
              ) : null}

              <button type="submit" className="primary-button" disabled={loading}>
                {loading ? 'Saving...' : isEditMode ? 'Save Boundary' : 'Save Field'}
              </button>
            </div>
          </form>
        </div>
      )}

      {savedField ? (
        <div className="preview-link-box">
          Field saved: <strong>{savedField.name}</strong>.{' '}
          <Link to="/satellite">Open satellite analytics</Link>
        </div>
      ) : null}

      <Toast message={message} variant={messageType} />
    </DashboardLayout>
  );
}
