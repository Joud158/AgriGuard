import React from 'react';

export default function MetricCard({ icon, title, value }) {
  const textValue = String(value ?? '');
  const isLongValue = textValue.length > 8;

  return (
    <div className="metric-card">
      <div className="metric-icon">
        <img src={icon} alt="" className="metric-icon-image" />
      </div>
      <div className="metric-card-content">
        <div className="metric-title">{title}</div>
        <div className={isLongValue ? 'metric-value metric-value-text' : 'metric-value'}>
          {textValue}
        </div>
      </div>
    </div>
  );
}
