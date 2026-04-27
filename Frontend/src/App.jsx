import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import PricingPage from './pages/PricingPage';
import AboutPage from './pages/AboutPage';
import HelpCenterPage from './pages/HelpCenterPage';
import AcceptInvitationPage from './pages/AcceptInvitationPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import VerifyEmailPage from './pages/VerifyEmailPage';
import RedirectPage from './pages/RedirectPage';
import UnauthorizedPage from './pages/UnauthorizedPage';

import AdminDashboardPage from './pages/dashboards/AdminDashboardPage';
import CoachDashboardPage from './pages/dashboards/CoachDashboardPage';
import PlayerDashboardPage from './pages/dashboards/PlayerDashboardPage';

import InviteUserPage from './pages/InviteUserPage';
import UsersAssignmentsPage from './pages/UsersAssignmentsPage';
import ProfilePage from './pages/ProfilePage';

import TeamsListPage from './pages/TeamsListPage';
import CreateTeamPage from './pages/CreateTeamPage';
import TeamRosterPage from './pages/TeamRosterPage';

import EventsListPage from './pages/EventsListPage';
import CreateEventPage from './pages/CreateEventPage';
import EditEventPage from './pages/EditEventPage';
import EventDetailPage from './pages/EventDetailPage';
import EventRequestsPage from './pages/EventRequestsPage';
import EventRequestDetailPage from './pages/EventRequestDetailPage';

import AnnouncementsPage from './pages/AnnouncementsPage';
import CreateAnnouncementPage from './pages/CreateAnnouncementPage';

import CropDiagnosisPage from './pages/CropDiagnosisPage';
import ConversationsPage from './pages/ConversationsPage';
import ConversationThreadPage from './pages/ConversationThreadPage';
import SatelliteMonitoringPage from './pages/SatelliteMonitoringPage';

import { ProtectedRoute, RoleRoute } from './components/RouteGuards';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/pricing" element={<PricingPage />} />
      <Route path="/about" element={<AboutPage />} />
      <Route path="/help-center" element={<HelpCenterPage />} />
      <Route path="/accept-invitation/:token" element={<AcceptInvitationPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password/:token" element={<ResetPasswordPage />} />
      <Route path="/verify-email/:token" element={<VerifyEmailPage />} />
      <Route path="/redirecting" element={<RedirectPage />} />
      <Route path="/unauthorized" element={<UnauthorizedPage />} />

      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <ProfilePage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={['admin']}>
              <AdminDashboardPage />
            </RoleRoute>
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/create-user"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={['admin']}>
              <InviteUserPage />
            </RoleRoute>
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/users-assignments"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={['admin']}>
              <UsersAssignmentsPage />
            </RoleRoute>
          </ProtectedRoute>
        }
      />

      <Route
        path="/coach"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={['coach']}>
              <CoachDashboardPage />
            </RoleRoute>
          </ProtectedRoute>
        }
      />

      <Route
        path="/player"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={['player']}>
              <PlayerDashboardPage />
            </RoleRoute>
          </ProtectedRoute>
        }
      />

      <Route
        path="/teams"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={['admin', 'coach']}>
              <TeamsListPage />
            </RoleRoute>
          </ProtectedRoute>
        }
      />

      <Route
        path="/teams/create"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={['admin']}>
              <CreateTeamPage />
            </RoleRoute>
          </ProtectedRoute>
        }
      />

      <Route
        path="/teams/:id"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={['admin', 'coach']}>
              <TeamRosterPage />
            </RoleRoute>
          </ProtectedRoute>
        }
      />

      <Route
        path="/satellite"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={['admin', 'coach', 'player']}>
              <SatelliteMonitoringPage />
            </RoleRoute>
          </ProtectedRoute>
        }
      />

      <Route
        path="/diagnosis"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={['player']}>
              <CropDiagnosisPage />
            </RoleRoute>
          </ProtectedRoute>
        }
      />

      <Route
        path="/events"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={['admin', 'coach', 'player']}>
              <EventsListPage />
            </RoleRoute>
          </ProtectedRoute>
        }
      />

      <Route
        path="/events/create"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={['admin', 'player']}>
              <CreateEventPage />
            </RoleRoute>
          </ProtectedRoute>
        }
      />

      <Route
        path="/events/:id/edit"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={['admin']}>
              <EditEventPage />
            </RoleRoute>
          </ProtectedRoute>
        }
      />

      <Route
        path="/events/:id"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={['admin', 'coach', 'player']}>
              <EventDetailPage />
            </RoleRoute>
          </ProtectedRoute>
        }
      />

      <Route
        path="/event-requests"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={['admin', 'coach', 'player']}>
              <EventRequestsPage />
            </RoleRoute>
          </ProtectedRoute>
        }
      />

      <Route
        path="/event-requests/:id"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={['admin', 'coach', 'player']}>
              <EventRequestDetailPage />
            </RoleRoute>
          </ProtectedRoute>
        }
      />

      <Route
        path="/announcements"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={['admin', 'coach', 'player']}>
              <AnnouncementsPage />
            </RoleRoute>
          </ProtectedRoute>
        }
      />

      <Route
        path="/announcements/create"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={['admin']}>
              <CreateAnnouncementPage />
            </RoleRoute>
          </ProtectedRoute>
        }
      />

      <Route
        path="/chat"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={['admin', 'coach', 'player']}>
              <ConversationsPage />
            </RoleRoute>
          </ProtectedRoute>
        }
      />

      <Route
        path="/chat/:id"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={['admin', 'coach', 'player']}>
              <ConversationThreadPage />
            </RoleRoute>
          </ProtectedRoute>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}