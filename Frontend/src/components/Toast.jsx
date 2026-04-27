import React from 'react';
export default function Toast({ message, variant = 'success' }) {
  if (!message) return null;
  return <div className={`toast ${variant}`}>{message}</div>;
}

