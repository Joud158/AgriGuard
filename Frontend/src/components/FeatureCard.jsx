import React from 'react';
export default function FeatureCard({ iconSrc, title, description }) {
  return (
    <div className="feature-card">
      <div className="feature-icon">
        <img src={iconSrc} alt={title} />
      </div>

      <div className="feature-card-content">
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
    </div>
  );
}
