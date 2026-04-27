import React, { useState } from 'react';

import DashboardLayout from '../layouts/DashboardLayout';
import Toast from '../components/Toast';

import { useAuth } from '../context/AuthContext';
import { analyzeCropImage } from '../services/authApi';

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = String(reader.result || '');
      const [, base64] = result.split(',');
      resolve({ base64: base64 || '', dataUrl: result });
    };

    reader.onerror = () => reject(new Error('Unable to read image.'));
    reader.readAsDataURL(file);
  });
}

export default function CropDiagnosisPage() {
  const { user } = useAuth();
  const role = user?.role || 'player';

  const [question, setQuestion] = useState('');
  const [imagePreview, setImagePreview] = useState('');
  const [imageBase64, setImageBase64] = useState('');
  const [mimeType, setMimeType] = useState('image/jpeg');
  const [result, setResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('error');

  async function handleImageChange(event) {
    const file = event.target.files?.[0];

    if (!file) {
      setImagePreview('');
      setImageBase64('');
      setMimeType('image/jpeg');
      setResult(null);
      return;
    }

    if (!file.type.startsWith('image/')) {
      setMessageType('error');
      setMessage('Please upload an image file.');
      return;
    }

    if (file.size > 4 * 1024 * 1024) {
      setMessageType('error');
      setMessage('Please upload an image smaller than 4 MB.');
      return;
    }

    const converted = await fileToBase64(file);

    setImagePreview(converted.dataUrl);
    setImageBase64(converted.base64);
    setMimeType(file.type || 'image/jpeg');
    setResult(null);
    setMessage('');
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!imageBase64) {
      setMessageType('error');
      setMessage('Upload a crop or leaf photo first.');
      return;
    }

    if (!question.trim()) {
      setMessageType('error');
      setMessage('Ask a question about the uploaded image.');
      return;
    }

    setSubmitting(true);
    setMessage('');

    const response = await analyzeCropImage({
      question,
      imageBase64,
      mimeType,
    });

    setSubmitting(false);

    if (!response.success) {
      setMessageType('error');
      setMessage(response.message || 'Unable to analyze this crop image.');
      return;
    }

    setResult(response.data);
    setMessageType('success');
    setMessage('AI Crop Doctor replied.');
  }

  return (
    <DashboardLayout role={role}>
      <section className="page-head compact">
        <div>
          <span className="hero-eyebrow">Farmer-only image chat</span>
          <h1>AI Crop Doctor</h1>
          <p>
            Upload a crop or leaf photo, then ask a question as you would in a normal chat.
          </p>
        </div>
      </section>

      <section className="dashboard-card crop-chat-card">
        <form className="crop-chat-form" onSubmit={handleSubmit}>
          <label className="form-field">
            <span>Crop / leaf photo</span>
            <input
              className="input"
              type="file"
              accept="image/*"
              onChange={handleImageChange}
            />
          </label>

          {imagePreview ? (
            <img
              src={imagePreview}
              alt="Uploaded crop leaf preview"
              className="leaf-preview crop-chat-preview"
            />
          ) : null}

          <label className="form-field">
            <span>Your question</span>
            <textarea
              className="input crop-question-input"
              rows={4}
              placeholder="Example: This is a tomato leaf. What might be wrong, and what should I do next?"
              value={question}
              onChange={(event) => {
                setQuestion(event.target.value);
                setResult(null);
                setMessage('');
              }}
            />
          </label>

          <button type="submit" className="primary-button full-width" disabled={submitting}>
            {submitting ? 'Analyzing...' : 'Ask AI Crop Doctor'}
          </button>
        </form>

        <div className="crop-chat-response">
          {!result ? (
            <div className="teams-note-card compact">
              <strong>No answer yet</strong>
              <p>
                Upload a clear image, mention the crop if you know it, and ask a question
                to get a model-supported reply.
              </p>
            </div>
          ) : (
            <article className="crop-answer-card">
              <div className="chat-message-bubble ai-crop-answer">
                <div className="chat-message-meta">
                  <strong>AI Crop Doctor</strong>
                  <span>Qwen2.5-VL local vision model</span>
                </div>

                <p className="ai-crop-answer-text">{result.answer}</p>
              </div>
            </article>
          )}
        </div>
      </section>

      <Toast message={message} variant={messageType} />
    </DashboardLayout>
  );
}