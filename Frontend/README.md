# AgriGuard Auth Frontend (React + Vite) — Real API Version

This is the same IAM frontend package, but it is wired to the real backend API instead of the in-browser mock service.

## Run

```bash
npm install
cp .env.example .env
npm run dev
```

## Environment

```bash
VITE_API_BASE_URL=http://localhost:4000/api
```

## Expected backend endpoints

- `POST /auth/register-admin`
- `POST /auth/login`
- `GET /auth/invitations/:token`
- `POST /auth/accept-invitation/:token`
- `GET /auth/me`
- `POST /auth/invitations`
- `GET /auth/users`
- `PATCH /auth/users/:userId/role`

## Demo accounts

Once the backend is running with its seed data:
- `admin@agriguard.com` / `Admin@123!`
- `coach@agriguard.com` / `Coach@123!`
- `player@agriguard.com` / `Player@123!`

## Demo invitation routes

- `/accept-invitation/invite-coach-123`
- `/accept-invitation/invite-player-123`
