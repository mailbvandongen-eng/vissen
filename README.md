# VisApp Monorepo (Sprint 1 bootstrap)

## Structuur

```text
vissen/
  frontend/               # Vite + React + TS + Tailwind + lucide-react
  backend/                # Fastify + Prisma + PostgreSQL
```

## Quick start

1. Installeer dependencies (root):
   - `npm install`
2. Maak env-bestanden aan:
   - `backend/.env` (kopie van `backend/.env.example`, vul je PostgreSQL URL in)
   - `frontend/.env` (kopie van `frontend/.env.example`, vul je Google Client ID in)
3. Prisma setup (backend):
   - `npm run prisma:generate --workspace backend`
   - `npm run prisma:migrate --workspace backend -- --name init`
   - `npm run prisma:seed --workspace backend`

## Ontwikkelen

Start backend en frontend in twee terminals:

- Terminal 1: `npm run dev --workspace backend`
- Terminal 2: `npm run dev --workspace frontend`

Of gebruik root-scripts:

- Backend: `npm run dev:backend`
- Frontend: `npm run dev:frontend`

## Build

- Frontend build: `npm run build --workspace frontend`
- Backend build: `npm run build --workspace backend`

## Auth endpoints (stap 3)

- `POST /auth/google/callback` met body `{ "idToken": "..." }`
- `GET /auth/me` met `Authorization: Bearer <app_jwt>`
- `GET /auth/admin-check` met `Authorization: Bearer <app_jwt>` (alleen rol `ADMIN`)

## Opmerking

Google login gebruikt de Google ID token van de frontend en zet die om naar een app-JWT.

## Security (belangrijk)

In een eerdere commit stonden `.env` bestanden in de repositorygeschiedenis. Ga ervan uit dat die secrets gecompromitteerd zijn en roteer:

- database wachtwoord / connection string
- `APP_JWT_SECRET`
- Google OAuth client secret(s) en eventueel client ID

Gebruik daarna alleen `.env.example` in git en houd echte `.env` lokaal of in je deployment secret manager.
