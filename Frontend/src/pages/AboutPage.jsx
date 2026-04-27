import React from 'react';
import PublicLayout from '../layouts/PublicLayout';

export default function AboutPage() {
  return (
    <PublicLayout sidebarActive="about">
      <div className="simple-page">
        <div className="page-head compact">
          <div>
            <h1>About AgriGuard</h1>
            <p>
              AgriGuard makes advanced crop monitoring practical for farmers,
              agronomists, and farm network administrators.
            </p>
          </div>
        </div>

        <div className="dashboard-card readable-card">
          <p>
            AgriGuard is an AI-enabled digital agronomist and monitoring platform
            that helps farmers detect crop stress, pest pressure, and disease-risk
            patterns early. It combines satellite-based vegetation anomaly
            detection, weather signals, crop-photo analysis, and agronomist
            follow-up in one platform.
          </p>

          <p>
            The platform helps identify unusual field stress by area and time,
            distinguish likely causes such as drought, disease, pests, or nutrient
            deficiency, and recommend practical next steps such as targeted
            inspection, selective spraying when needed, and prioritized agronomist
            visits.
          </p>

          <p>
            Farmers can monitor their fields, upload crop images for AI-supported
            diagnosis, request agronomist support, and communicate with the farm
            network team. Agronomists can review satellite alerts, manage visit
            requests, check calendar conflicts, and support farmers through chat.
            Administrators can manage farmers and agronomists, send announcements,
            assign tasks, and oversee platform activity.
          </p>
        </div>
      </div>
    </PublicLayout>
  );
}
