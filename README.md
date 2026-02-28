# VisApp Monorepo (Sprint 1 bootstrap)

## Structuur

```text
vissen/
  frontend/               # Vite + React + TS + Tailwind + lucide-react
  backend/                # Fastify + Prisma + PostgreSQL
```

## Quick start

1. Kopieer `backend/.env.example` naar `backend/.env` en vul je PostgreSQL URL in.
2. Kopieer `frontend/.env.example` naar `frontend/.env` en vul je Google Client ID in.
3. Installeer dependencies:
   - `npm install`
   - `npm install --workspace frontend`
   - `npm install --workspace backend`
4. Prisma:
   - `npm run prisma:generate --workspace backend`
   - `npm run prisma:migrate --workspace backend -- --name init`
   - `npm run prisma:seed --workspace backend`
5. Start:
   - Frontend: `npm run dev --workspace frontend`
   - Backend: `npm run dev --workspace backend`

## Auth endpoints (stap 3)

- `POST /auth/google/callback` met body `{ "idToken": "..." }`
- `GET /auth/me` met `Authorization: Bearer <app_jwt>`
- `GET /auth/admin-check` met `Authorization: Bearer <app_jwt>` (alleen rol `ADMIN`)

## Opmerking

Google login gebruikt de Google ID token van de frontend en zet die om naar een app-JWT.
