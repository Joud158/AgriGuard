import React from 'react';
import { Link } from 'react-router-dom';
import PublicLayout from '../layouts/PublicLayout';
import FeatureCard from '../components/FeatureCard';

import aiIcon from '../assets/ai.png';
import messagingIcon from '../assets/messaging.png';
import satelliteIcon from '../assets/satellite.png';
import peopleIcon from '../assets/people.png';
import farmerImage from '../assets/farmer.png';

export default function HomePage() {

  return (
    <PublicLayout sidebarActive="home">
      <div className="home-page agri-home">
        <section className="home-hero agri-hero">
          <div className="home-hero-copy">
            <span className="hero-eyebrow">
              AI-Powered Digital Agronomist & Crop Monitoring
            </span>

            <h1>
              Detect crop stress early.
              <br />
              Spray only when needed.
            </h1>

            <p>
              AgriGuard helps farmers detect unusual crop stress through
              satellite-based vegetation monitoring, weather-risk signals,
              AI-supported crop-photo analysis, and direct communication with
              agronomists.
            </p>

            <div className="hero-actions">
              <Link className="primary-button" to="/signup">
                Start Monitoring
              </Link>

              <Link className="secondary-button" to="/login">
                Log In
              </Link>
            </div>
          </div>

          <div className="home-hero-art farmer-hero-art">
            <img
              src={farmerImage}
              alt="Farmer using AgriGuard crop monitoring platform"
              className="home-farmer-image"
            />
          </div>
        </section>

        <section className="home-feature-section">
          <div className="section-title centered">
            <h2>One platform for smarter crop protection</h2>
            <p>
              Monitor fields, detect stress patterns, validate symptoms, request
              agronomist support, and reduce unnecessary spraying.
            </p>
          </div>

          <div className="home-features-layout features-only">
            <div className="home-feature-grid">
              <FeatureCard
                iconSrc={peopleIcon}
                title="Farm & Field Management"
                description="Organize farmers, agronomists, fields, responsibilities, and farm activity from one place."
              />

              <FeatureCard
                iconSrc={satelliteIcon}
                title="Satellite + Weather Alerts"
                description="Flag unusual vegetation stress by area and time using satellite anomaly and weather-risk signals."
              />

              <FeatureCard
                iconSrc={messagingIcon}
                title="Farmer–Agronomist Chat"
                description="Discuss field observations, share follow-ups, and prioritize agronomist visits based on risk."
              />

              <FeatureCard
                iconSrc={aiIcon}
                title="AI Crop Diagnosis"
                description="Combine crop photos, symptoms, satellite stress, and weather signals into likely causes and next steps."
              />
            </div>
          </div>
        </section>
      </div>
    </PublicLayout>
  );
}
