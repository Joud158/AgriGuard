import React from 'react';
import PublicLayout from '../layouts/PublicLayout';

export default function PricingPage() {
  return (
    <PublicLayout sidebarActive="pricing">
      <div className="simple-page">
        <div className="page-head compact">
          <div>
            <h1>Pricing</h1>
            <p>Start free, then upgrade as your farm monitoring and advisory needs grow.</p>
          </div>
        </div>

        <div className="pricing-grid">
          <div className="pricing-card">
            <h3>Freemium</h3>
            <div className="pricing-price">
              $0<span>/month</span>
            </div>
            <ul>
              <li>Basic farm and field profile</li>
              <li>Limited satellite field overview</li>
              <li>View platform announcements</li>
              <li>Basic support access</li>
            </ul>
            <button className="primary-button full-width">Start Free</button>
          </div>

          <div className="pricing-card featured">
            <h3>Grower</h3>
            <div className="pricing-price">
              $15<span>/month</span>
            </div>
            <ul>
              <li>Everything in Freemium</li>
              <li>Satellite anomaly dashboard</li>
              <li>Weather-risk alerts</li>
              <li>Farmer–agronomist chat</li>
              <li>Agronomist visit requests</li>
            </ul>
            <button className="primary-button full-width">Choose Grower</button>
          </div>

          <div className="pricing-card">
            <h3>Agri Intelligence</h3>
            <div className="pricing-price">
              $30<span>/month</span>
            </div>
            <ul>
              <li>Everything in Grower</li>
              <li>AI-assisted crop photo diagnosis</li>
              <li>Priority agronomist workflow</li>
              <li>Advanced satellite and field analytics</li>
              <li>Multi-field monitoring support</li>
            </ul>
            <button className="primary-button full-width">Choose Intelligence</button>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}
