import React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import DashboardLayout from '../layouts/DashboardLayout';
import Toast from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import { getEvents, deleteEvent } from '../services/authApi';
import { saveVoiceDraft } from '../services/voiceDraftSession';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];
const TYPE_LABELS = {
  training: 'Field scouting to-do',
  match: 'Agronomist field visit',
  meeting: 'Advisory call',
  other: 'Other farm task',
};

function getMonthData(year, month) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  let startWeekday = new Date(year, month, 1).getDay() - 1;
  if (startWeekday < 0) startWeekday = 6;
  return { daysInMonth, startWeekday };
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function formatDateTime(iso) {
  if (!iso) return '\u2014';
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export default function EventsListPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const typeFilter = searchParams.get('type') || '';
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('error');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [openMenu, setOpenMenu] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [voiceModalOpen, setVoiceModalOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingStartedAt, setRecordingStartedAt] = useState(null);
  const [voiceCaptureError, setVoiceCaptureError] = useState('');
  const [voiceClip, setVoiceClip] = useState(null);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [isProcessingVoice, setIsProcessingVoice] = useState(false);

  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const recognitionRef = useRef(null);
  const transcriptRef = useRef('');

  const supportsVoiceCapture = Boolean(
    typeof window !== 'undefined' &&
      window.MediaRecorder &&
      navigator.mediaDevices?.getUserMedia
  );
  const SpeechRecognitionConstructor =
    typeof window !== 'undefined'
      ? window.SpeechRecognition || window.webkitSpeechRecognition
      : null;
  const supportsSpeechRecognition = Boolean(SpeechRecognitionConstructor);

  const role = user?.role || 'player';
  const canManage = role === 'admin';
  const canUseRequests = role === 'admin' || role === 'coach' || role === 'player';

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const { daysInMonth, startWeekday } = getMonthData(year, month);
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;
  const todayDate = today.getDate();

  useEffect(() => {
    let active = true;
    getEvents()
      .then((res) => {
        if (!active) return;
        if (!res.success) {
          setMessageType('error');
          setMessage(res.message || 'Unable to load events.');
        } else {
          setEvents(res.data);
        }
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setMessageType('error');
        setMessage('Unable to load events right now.');
        setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const eventsByDay = useMemo(() => {
    const map = {};
    const source = typeFilter ? events.filter((e) => e.type === typeFilter) : events;
    for (const evt of source) {
      const d = new Date(evt.start_time);
      if (d.getFullYear() === year && d.getMonth() === month) {
        const day = d.getDate();
        if (!map[day]) map[day] = [];
        map[day].push(evt);
      }
    }
    return map;
  }, [events, year, month, typeFilter]);

  const filteredEvents = useMemo(() => {
    if (!typeFilter) return events;
    return events.filter((e) => e.type === typeFilter);
  }, [events, typeFilter]);

  function prevMonth() { setCurrentDate(new Date(year, month - 1, 1)); }
  function nextMonth() { setCurrentDate(new Date(year, month + 1, 1)); }
  function goToday() { setCurrentDate(new Date()); }

  useEffect(() => {
    if (!openMenu) return;
    function handleOutside() { setOpenMenu(null); }
    document.addEventListener('click', handleOutside);
    return () => document.removeEventListener('click', handleOutside);
  }, [openMenu]);

  useEffect(() => {
    return () => {
      if (voiceClip?.objectUrl) {
        URL.revokeObjectURL(voiceClip.objectUrl);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, [voiceClip]);

  function toBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || '');
        const [, base64] = result.split(',');
        resolve(base64 || '');
      };
      reader.onerror = () => reject(new Error('Unable to read the recorded audio.'));
      reader.readAsDataURL(blob);
    });
  }

  function resolveRecorderMimeType() {
    if (!window.MediaRecorder?.isTypeSupported) {
      return '';
    }

    const preferredTypes = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
    ];

    return preferredTypes.find((entry) => window.MediaRecorder.isTypeSupported(entry)) || '';
  }

  async function handleStartRecording() {
    if (!supportsVoiceCapture) {
      setVoiceCaptureError('Voice capture is not supported in this browser.');
      return;
    }

    setVoiceCaptureError('');
    setLiveTranscript('');
    transcriptRef.current = '';

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = resolveRecorderMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      chunksRef.current = [];
      streamRef.current = stream;
      recorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        setIsProcessingVoice(true);
        const audioBlob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        const base64 = await toBase64(audioBlob);
        const objectUrl = URL.createObjectURL(audioBlob);
        const durationSeconds = recordingStartedAt
          ? Math.max(1, Math.round((Date.now() - recordingStartedAt) / 1000))
          : null;

        if (voiceClip?.objectUrl) {
          URL.revokeObjectURL(voiceClip.objectUrl);
        }

        setVoiceClip({
          blob: audioBlob,
          audioBase64: base64,
          mimeType: audioBlob.type || 'audio/webm',
          durationSeconds,
          transcript: transcriptRef.current.trim(),
          objectUrl,
        });

        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        chunksRef.current = [];
        setRecordingStartedAt(null);
        setIsProcessingVoice(false);
      };

      recorder.start();

      if (supportsSpeechRecognition) {
        const recognition = new SpeechRecognitionConstructor();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onresult = (event) => {
          let nextTranscript = '';
          for (let index = 0; index < event.results.length; index += 1) {
            const result = event.results[index];
            const text = result[0]?.transcript || '';
            nextTranscript += `${text} `;
          }

          const cleaned = nextTranscript.trim().replace(/\s+/g, ' ');
          transcriptRef.current = cleaned;
          setLiveTranscript(cleaned);
        };

        recognition.onerror = () => {
          setVoiceCaptureError('Could not process speech input in this browser.');
        };

        recognitionRef.current = recognition;
        recognition.start();
      }

      setRecordingStartedAt(Date.now());
      setIsRecording(true);
    } catch {
      setVoiceCaptureError('Microphone access was denied or unavailable.');
      setIsRecording(false);
      setRecordingStartedAt(null);
    }
  }

  function handleStopRecording() {
    if (!recorderRef.current || recorderRef.current.state === 'inactive') {
      return;
    }

    setIsProcessingVoice(true);
    recorderRef.current.stop();
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsRecording(false);
  }

  function handleDiscardVoiceClip() {
    if (voiceClip?.objectUrl) {
      URL.revokeObjectURL(voiceClip.objectUrl);
    }
    setVoiceClip(null);
    setVoiceCaptureError('');
    setLiveTranscript('');
    transcriptRef.current = '';
  }

  function handleVoiceConfirm() {
    if (!voiceClip?.audioBase64) {
      setVoiceCaptureError('Please record and stop audio first.');
      return;
    }

    if (voiceClip?.audioBase64) {
      saveVoiceDraft({
        audioBase64: voiceClip.audioBase64,
        mimeType: voiceClip.mimeType || 'audio/webm',
        transcriptHint: voiceClip.transcript || '',
        applyParsing: true,
      });
    }
    setVoiceModalOpen(false);
    navigate('/events/create');
  }

  async function handleDelete(evtId) {
    setOpenMenu(null);
    if (!window.confirm('Delete this event? This cannot be undone.')) return;
    setDeletingId(evtId);
    const res = await deleteEvent(evtId);
    setDeletingId(null);
    if (!res.success) {
      setMessageType('error');
      setMessage(res.message || 'Unable to delete event.');
      return;
    }
    setEvents((prev) => prev.filter((e) => e.id !== evtId));
  }

  return (
    <DashboardLayout role={role}>
      <div className="page-head">
        <div className="page-head-text">
          <h1>{typeFilter ? `${TYPE_LABELS[typeFilter] || typeFilter} Events` : 'Calendar & Events'}</h1>
          <p>
            {typeFilter
              ? `Showing only ${(TYPE_LABELS[typeFilter] || typeFilter).toLowerCase()} events.`
              : role === 'coach'
                ? 'Your field-visit calendar. Open requests to accept or reject farmer visit requests and review conflicts.'
                : role === 'player'
                  ? 'Your farm calendar, field visits, and assigned to-dos.'
                  : 'All scheduled farmer to-dos and field visits.'}
          </p>
        </div>
        <div
          className="head-actions events-head-actions"
          style={{
            flexWrap: 'wrap',
            justifyContent: 'flex-end',
            alignItems: 'center',
            maxWidth: 880,
          }}
        >
          <select
            value={typeFilter}
            onChange={(e) => {
              if (e.target.value) {
                setSearchParams({ type: e.target.value });
              } else {
                setSearchParams({});
              }
            }}
            className="input"
            style={{ minWidth: 150 }}
          >
            <option value="">All types</option>
            {Object.entries(TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          {canUseRequests ? (
            <Link to="/event-requests" className="secondary-button">
              View Requests
            </Link>
          ) : null}
          {canManage && (
            <Link to="/events/create" className="primary-button">+ Add Farmer To-Do</Link>
          )}
          {role === 'player' ? (
            <Link to="/events/create" className="primary-button">Request Agronomist</Link>
          ) : null}
        </div>
      </div>

      {loading ? (
        <p className="loading-text">Loading...</p>
      ) : (
        <div className="cal-events-grid">
          <div className="dashboard-card coach-calendar">
            <div className="section-row">
              <h2>Calendar</h2>
              <div className="section-row">
                <button className="mini-button outline" onClick={prevMonth}>&lt;</button>
                <button className="mini-button outline" onClick={goToday}>Today</button>
                <button className="mini-button outline" onClick={nextMonth}>&gt;</button>
              </div>
            </div>
            <div className="month-strip">{MONTH_NAMES[month]} {year}</div>
            <div className="coach-calendar-grid">
              {WEEKDAYS.map((d) => (
                <div key={d} className="day-name">{d}</div>
              ))}
              {Array.from({ length: startWeekday }, (_, i) => (
                <div key={`e-${i}`} className="coach-day-box empty" />
              ))}
              {Array.from({ length: daysInMonth }, (_, i) => {
                const day = i + 1;
                const dayEvents = eventsByDay[day] || [];
                const isToday = isCurrentMonth && day === todayDate;
                return (
                  <div key={day} className={`coach-day-box${isToday ? ' today' : ''}`}>
                    <span>{day}</span>
                    {dayEvents.map((evt) => (
                      <div key={evt.id} className="day-event-chip">
                        <Link to={`/events/${evt.id}`} className="day-event-chip-text">
                          {evt.title} | {formatTime(evt.start_time)}
                        </Link>
                        {canManage && (
                          <div className="dot-menu-wrap">
                            <button
                              className="dot-menu-btn"
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpenMenu(openMenu === `cal:${evt.id}` ? null : `cal:${evt.id}`); }}
                            >⋮</button>
                            {openMenu === `cal:${evt.id}` && (
                              <div className="dot-menu-dropdown">
                                <button onClick={() => navigate(`/events/${evt.id}/edit`)}>Edit</button>
                                <button className="danger" onClick={() => handleDelete(evt.id)} disabled={deletingId === evt.id}>
                                  {deletingId === evt.id ? 'Deleting...' : 'Delete'}
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="dashboard-card events-panel">
            <h2>{typeFilter ? `${TYPE_LABELS[typeFilter] || typeFilter} Events` : 'Events'}</h2>
            {filteredEvents.length === 0 ? (
              <div className="teams-note-card compact">
                <strong>{typeFilter ? `No ${(TYPE_LABELS[typeFilter] || typeFilter).toLowerCase()} events` : 'No events yet'}</strong>
                <p>
                  {canManage
                    ? 'Create your first event to get started.'
                    : role === 'coach'
                      ? 'No farmer visit requests have been approved yet.'
                      : role === 'player'
                        ? 'No field visits or to-dos have been scheduled yet.'
                        : 'No events have been scheduled yet.'}
                </p>
              </div>
            ) : (
              <div className="events-panel-list">
                {filteredEvents.map((evt) => (
                  <div
                    key={evt.id}
                    className="event-row-card"
                    style={{ position: 'relative', zIndex: openMenu === `panel:${evt.id}` ? 100 : undefined }}
                  >
                    <Link to={`/events/${evt.id}`} className="event-row-info" style={{ textDecoration: 'none', color: 'inherit' }}>
                      <strong>{evt.title}</strong>
                      <span className="event-row-meta">
                        {TYPE_LABELS[evt.type] || evt.type} &middot; {formatDateTime(evt.start_time)}
                        {evt.location ? ` \u2022 ${evt.location}` : ''}
                      </span>
                    </Link>
                    {canManage && (
                      <div className="dot-menu-wrap">
                        <button
                          className="dot-menu-btn"
                          onClick={(e) => { e.stopPropagation(); setOpenMenu(openMenu === `panel:${evt.id}` ? null : `panel:${evt.id}`); }}
                        >⋮</button>
                        {openMenu === `panel:${evt.id}` && (
                          <div className="dot-menu-dropdown">
                            <button onClick={() => navigate(`/events/${evt.id}/edit`)}>Edit</button>
                            <button className="danger" onClick={() => handleDelete(evt.id)} disabled={deletingId === evt.id}>
                              {deletingId === evt.id ? 'Deleting...' : 'Delete'}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {false ? (
        <>
          <button
            type="button"
            className="voice-fab"
            onClick={() => setVoiceModalOpen(true)}
            aria-label="Open voice input"
          >
            <img src={micIcon} alt="" aria-hidden="true" />
          </button>

          {voiceModalOpen ? (
            <div className="voice-modal-overlay" onClick={() => setVoiceModalOpen(false)}>
              <div className="voice-modal-card" onClick={(event) => event.stopPropagation()}>
                <button
                  type="button"
                  className="voice-modal-close"
                  onClick={() => setVoiceModalOpen(false)}
                  aria-label="Close voice modal"
                >
                  x
                </button>

                <div className="voice-modal-wave" aria-hidden="true" />
                <div className="voice-modal-icon-wrap">
                  <img src={micIcon} alt="" aria-hidden="true" className="voice-modal-icon" />
                </div>

                <p className="voice-modal-kicker">
                  {isRecording
                    ? 'Listening'
                    : isProcessingVoice
                      ? 'Processing'
                      : voiceClip
                        ? 'Draft Captured'
                        : 'Voice Scheduling'}
                </p>

                <p className="voice-modal-text">
                  {isRecording
                    ? (liveTranscript || 'Listening... describe your event now.')
                    : isProcessingVoice
                      ? 'Processing your voice input...'
                      : voiceClip?.transcript
                        ? voiceClip.transcript
                        : voiceClip
                          ? 'Voice clip captured. Confirm event to continue with this draft.'
                          : 'Tap start recording and describe your event details by voice.'}
                </p>

                <p className="voice-modal-subtext">
                  {voiceClip
                    ? 'Review this draft, then confirm event or edit manually.'
                    : 'Start recording to generate a voice-based event draft.'}
                </p>

                {isRecording || isProcessingVoice ? (
                  <div className="voice-loading-dots" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                    <span />
                    <span />
                  </div>
                ) : null}

                {!supportsVoiceCapture ? (
                  <p className="voice-capture-note error">Voice capture is not supported in this browser.</p>
                ) : (
                  <div className="voice-capture-actions centered">
                    {!isRecording ? (
                      <button type="button" className="secondary-button" onClick={handleStartRecording}>
                        Start Recording
                      </button>
                    ) : (
                      <button type="button" className="danger-button" onClick={handleStopRecording}>
                        Stop Recording
                      </button>
                    )}
                    {voiceClip ? (
                      <button type="button" className="secondary-button" onClick={handleDiscardVoiceClip}>
                        Discard
                      </button>
                    ) : null}
                  </div>
                )}

                {voiceCaptureError ? (
                  <p className="voice-capture-note error">{voiceCaptureError}</p>
                ) : null}
                {voiceClip ? (
                  <>
                    <audio controls src={voiceClip.objectUrl} className="voice-capture-audio" />
                    {voiceClip.transcript ? (
                      <p className="voice-transcript-preview">{voiceClip.transcript}</p>
                    ) : null}
                  </>
                ) : null}

                <button
                  type="button"
                  className="voice-modal-confirm"
                  onClick={handleVoiceConfirm}
                  disabled={isRecording || isProcessingVoice}
                >
                  Confirm event
                </button>
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      <Toast message={message} variant={messageType} />
    </DashboardLayout>
  );
}

