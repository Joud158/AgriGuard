# AgriGuard

AgriGuard is an AI-enabled farm monitoring platform that helps farmers detect crop-health issues, request agronomist support, and coordinate field visits through satellite insights, local AI image analysis, role-based calendars, notifications, and chat.

## Overview

AgriGuard connects three main roles:

- **Admin**: manages farmers, agronomists, fields, assignments, announcements, visit requests, and platform-wide scheduling.
- **Farmer**: views their assigned field, checks satellite analytics, uses the AI Crop Doctor, requests agronomist visits, receives announcements, and chats with support.
- **Agronomist**: reviews assigned requests, accepts or rejects visits, checks their calendar, receives admin/farmer notifications, and communicates through chat.

The system is designed to support early crop-health detection, safer decision-making, and faster coordination between farmers and agronomists.

## Key Features

### AI Crop Doctor

Farmers can upload a crop or leaf image and ask a question. The local Qwen vision-language model analyzes the image and provides a practical advisory, including:

- likely visual issue,
- visible symptoms,
- inspection/documentation steps,
- when to request an agronomist.

The AI advisory is not a confirmed diagnosis and does not replace agronomist confirmation.

### Satellite Monitoring

AgriGuard supports satellite-based field monitoring workflows, including mapped field boundaries and vegetation-stress indicators such as NDVI-style analytics.

### Field and User Management

Admins can:

- create mapped fields,
- assign one farmer to a field,
- assign agronomists to one or more fields,
- deactivate or reactivate users,
- change field assignments,
- manage farmer and agronomist responsibilities.

### Agronomist Request Workflow

The intended request flow is:

1. Farmer submits an agronomist visit request.
2. Request goes to admin review.
3. Admin assigns an available agronomist.
4. Agronomist receives a notification.
5. Agronomist accepts or rejects the request.
6. Accepted requests appear in the role-based calendar.

### Role-Based Calendar

- Admin sees all scheduled visits and requests.
- Agronomists see only their assigned or accepted tasks.
- Farmers see only visits and requests linked to their assigned field.

### Announcements

- Admin can create and send announcements.
- Farmers and agronomists can view announcements.
- Farmers and agronomists cannot create announcements.

### Notifications and Chat

The platform supports notification workflows for requests, assignments, announcements, and messages. Users can also communicate through a built-in chat system.

## Tech Stack

### Frontend

- React
- Vite
- JavaScript
- CSS

### Backend

- Node.js
- Express.js
- JSON/file-based local data store or local database depending on configuration
- JWT authentication
- Role-based authorization
- Email support through SMTP
- Pusher support for real-time notifications/chat

### Local AI Service

- Python
- FastAPI
- Uvicorn
- PyTorch
- Hugging Face Transformers
- Qwen2.5-VL local vision-language model

## Project Structure

```text
agriguard/
├── Backend/
│   ├── src/
│   │   ├── config/
│   │   ├── controllers/
│   │   ├── data/
│   │   ├── middleware/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── utils/
│   │   └── validators/
│   ├── package.json
│   └── .env
│
├── Frontend/
│   ├── src/
│   │   ├── assets/
│   │   ├── components/
│   │   ├── context/
│   │   ├── layouts/
│   │   ├── pages/
│   │   ├── services/
│   │   └── utils/
│   ├── package.json
│   └── .env
│
├── local-ai-service/
│   ├── app.py
│   ├── requirements.txt
│   ├── models/              # local model files, not committed to GitHub
│   └── .venv/               # local virtual environment, not committed to GitHub
│
└── README.md
```

## Prerequisites

Install the following before running the project:

- Node.js
- npm
- Python 3.10 or newer
- Git
- A local copy of the Qwen2.5-VL model if using the AI Crop Doctor locally

## Environment Variables

Create a `.env` file inside the `Backend/` folder.

Use this example and replace placeholder values with your own local configuration:

```env
PORT=4000
JWT_SECRET=replace_with_a_secure_secret
JWT_EXPIRES_IN=7d
INVITATION_TTL_HOURS=72
EMAIL_VERIFICATION_TTL_HOURS=24
PASSWORD_RESET_TTL_MINUTES=30
MFA_CHALLENGE_TTL_MINUTES=10
MFA_ISSUER=AgriGuard

CORS_ORIGIN=http://localhost:5173
FRONTEND_BASE_URL=http://localhost:5173
SHOW_INVITE_PREVIEW_LINK=true
SHOW_PASSWORD_RESET_PREVIEW_LINK=false

EMAIL_ENABLED=false
EMAIL_PROVIDER=smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_email@example.com
SMTP_PASS=your_app_password
EMAIL_FROM=AgriGuard <your_email@example.com>
EMAIL_REPLY_TO=your_email@example.com

PUSHER_APP_ID=your_pusher_app_id
PUSHER_KEY=your_pusher_key
PUSHER_SECRET=your_pusher_secret
PUSHER_CLUSTER=your_pusher_cluster

AI_PROVIDER=local
LOCAL_AI_SERVICE_URL=http://127.0.0.1:8105
LOCAL_VISION_MODEL=Qwen2.5-VL-3B-Instruct
LOCAL_VISION_MODEL_PATH=../local-ai-service/models/Qwen2.5-VL-3B-Instruct

SATELLITE_PROVIDER=auto
SENTINEL_CLIENT_ID=your_sentinel_client_id
SENTINEL_CLIENT_SECRET=your_sentinel_client_secret
SENTINEL_TOKEN_URL=https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token
SENTINEL_STATS_URL=https://sh.dataspace.copernicus.eu/statistics/v1
NASA_POWER_ENABLED=true
```

Create a `.env` file inside the `Frontend/` folder if needed:

```env
VITE_API_BASE_URL=http://localhost:4000/api
```

Never commit `.env` files to GitHub.

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/Joud158/AgriGuard.git
cd AgriGuard
```

### 2. Install backend dependencies

```bash
cd Backend
npm install
```

### 3. Install frontend dependencies

```bash
cd ../Frontend
npm install
```

### 4. Set up the local AI service

```bash
cd ../local-ai-service
python -m venv .venv
```

Activate the virtual environment.

On Windows PowerShell:

```powershell
.\.venv\Scripts\Activate.ps1
```

Then install dependencies:

```bash
pip install -r requirements.txt
```

If `requirements.txt` is not available, install the core packages manually:

```bash
pip install fastapi uvicorn pillow torch transformers qwen-vl-utils accelerate
```

## Local Qwen Model Setup

The model files should stay local and should not be uploaded to GitHub.

Expected local path:

```text
local-ai-service/models/Qwen2.5-VL-3B-Instruct
```

Recommended `.gitignore` entries:

```gitignore
**/node_modules/
**/.env
**/.env.local
**/.env.development.local
**/.env.test.local
**/.env.production.local
**/dist/
**/coverage/
**/build/
**/.venv/
**/venv/
**/__pycache__/
**/*.pyc
local-ai-service/models/
*.log
.DS_Store
Thumbs.db
.idea/
```

## Running the Project

You need three terminals.

### Terminal 1: Local AI Service

```bash
cd local-ai-service
```

On Windows PowerShell:

```powershell
.\.venv\Scripts\Activate.ps1
uvicorn app:app --host 127.0.0.1 --port 8105
```

Health check:

```bash
http://127.0.0.1:8105/health
```

The model may load lazily on the first image request, so the first AI request can be slower.

### Terminal 2: Backend

```bash
cd Backend
npm run dev
```

Backend runs on:

```text
http://localhost:4000
```

### Terminal 3: Frontend

```bash
cd Frontend
npm run dev
```

Frontend runs on:

```text
http://localhost:5173
```

## AI Crop Doctor Notes

The local Qwen model can be slow on laptops without a dedicated GPU. For better demo performance:

- use a small cropped crop/leaf image,
- avoid full-resolution phone photos,
- click the AI button once and wait,
- keep the local AI service terminal open,
- make sure the backend `.env` has `LOCAL_AI_SERVICE_URL=http://127.0.0.1:8105`.

If the AI service port is already in use on Windows:

```powershell
netstat -ano | findstr :8105
```

Then kill the process by PID:

```powershell
taskkill /PID <PID> /F
```

## Demo Scenario

A recommended demo flow:

1. Login as admin.
2. Show dashboard overview.
3. Create or review a field, such as `Janoub Green Farm`.
4. Assign a farmer to the field.
5. Show that agronomists can support multiple fields.
6. Login as farmer.
7. Open AI Crop Doctor.
8. Upload a crop/leaf image and ask what to do.
9. Submit an agronomist visit request.
10. Login as admin.
11. Review the request and assign an agronomist.
12. Login as agronomist.
13. Accept or reject the request.
14. Show role-based calendar visibility.
15. Use chat to follow up with the farmer.
16. Show announcements created by admin and viewed by farmer/agronomist.

## Important Security Notes

Do not commit the following to GitHub:

- `.env` files,
- SMTP passwords,
- JWT secrets,
- Pusher secrets,
- Sentinel client secrets,
- local AI model weights,
- `node_modules`,
- Python virtual environments.

If any secrets were accidentally pushed to a public repository, rotate them immediately.

## Repository Description

AgriGuard is an AI-enabled farm monitoring platform that helps farmers detect crop-health issues, request agronomist support, and coordinate field visits through satellite insights, local AI image analysis, role-based calendars, notifications, and chat.

## License

This project is intended for academic and demonstration purposes. Add a license file if you plan to publish or reuse it publicly.
