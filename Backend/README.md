# AgriGuard Auth Backend (Node.js + Express)

This package implements the **Identity & Access Management backend** for the Smart Agriculture Club Management project.

Implemented scope:
- administrator registration + club creation
- login with JWT
- secure password hashing with bcrypt
- invitation creation with secure time-limited tokens
- invitation acceptance + password creation
- authentication middleware for protected routes
- backend RBAC enforcement
- role assignment endpoint for the admin role page
- input validation and consistent JSON responses

## Stack

- Node.js
- Express
- bcryptjs
- jsonwebtoken
- zod
- file-based JSON persistence for demo purposes

## Run

```bash
npm install
cp .env.example .env
npm run dev
```

The API runs on `http://localhost:4000` by default.

## Demo accounts

- `admin@agriguard.com` / `Admin@123!`
- `coach@agriguard.com` / `Coach@123!`
- `player@agriguard.com` / `Player@123!`

## Demo invitation links

These are pre-seeded and already valid on first run:

- `http://localhost:5173/accept-invitation/invite-coach-123`
- `http://localhost:5173/accept-invitation/invite-player-123`

## API endpoints

### Public
- `POST /api/auth/register-admin`
- `POST /api/auth/login`
- `GET /api/auth/invitations/:token`
- `POST /api/auth/accept-invitation/:token`

### Protected
- `GET /api/auth/me`
- `POST /api/auth/invitations` *(admin only)*
- `GET /api/auth/users` *(admin only)*
- `PATCH /api/auth/users/:userId/role` *(admin only)*

## Request examples

### Register admin

```json
{
  "fullName": "Hasan S",
  "email": "hasan@example.com",
  "password": "StrongPass@123",
  "confirmPassword": "StrongPass@123",
  "clubName": "Spike Lab",
  "city": "Beirut"
}
```

### Login

```json
{
  "email": "admin@agriguard.com",
  "password": "Admin@123!"
}
```

### Invite user

```json
{
  "fullName": "Maya Coach",
  "email": "maya@agriguard.com",
  "role": "coach",
  "team": "Tigers"
}
```

### Update user role

```json
{
  "role": "player",
  "team": "Eagles"
}
```

## Notes

- This backend is limited to **your subsystem only**. It does not implement team, player, event, notification, or chat modules.
- For a clean team demo, it stores a light `assigned_team` string used by the invite page and role-assignment UI. In the final integrated version, that should be replaced by the official membership/team subsystem once your teammate exposes that API.
- Invitation email delivery is stubbed by returning a preview link in the response. That keeps your flow demo-ready without requiring SMTP.

## Tests

```bash
npm test
```
