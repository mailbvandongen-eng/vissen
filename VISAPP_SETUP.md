# VisApp - Complete Setup & Debug Documentatie

## Laatste update: 2026-03-01

---

## ARCHITECTUUR OVERZICHT

```
Frontend (React + Vite)     Backend (Fastify + Prisma)     External Services
       :5173                        :4000
         |                            |
         +-- Google Login ----------->+-- Google OAuth verify
         |                            |
         +-- Photos Picker ---------->+-- Google Photos Picker API
         |                            |      |
         |                            |      v
         |                            +-- Download foto
         |                            |      |
         |                            |      v
         |                            +-- Extract EXIF (sharp + exif-parser)
         |                            |      |
         |                            |      v
         |                            +-- Upload naar Supabase Storage
         |                            |      |
         |                            |      v
         |                            +-- Fetch weer data (Open-Meteo API)
         |                            |      |
         |                            |      v
         |                            +-- Opslaan in PostgreSQL (Supabase)
         |                            |
         +<-- JSON response ----------+
```

---

## ALLE ENV VARIABELEN

### Backend (`backend/.env`)

| Variabele | Status | Waarde | Beschrijving |
|-----------|--------|--------|--------------|
| `DATABASE_URL` | OK | `postgresql://...pooler.supabase.com:6543/...` | Supabase PostgreSQL (via PgBouncer) |
| `DIRECT_URL` | OK | `postgresql://...supabase.co:5432/...` | Direct PostgreSQL (voor migraties) |
| `SUPABASE_URL` | OK | `https://iruwohlhizimfnurownw.supabase.co` | Supabase project URL |
| `SUPABASE_ANON_KEY` | OK | `eyJhbGciOi...` | Supabase anonymous key |
| `APP_JWT_SECRET` | OK | `ie+jW7u9Ry...` | JWT signing secret (64 chars) |
| `GOOGLE_CLIENT_ID` | OK | `371289174777-...` | Google OAuth Client ID |
| `FRONTEND_ORIGIN` | OK | `http://localhost:5173` | CORS allowed origin |
| `DEV_AUTH_BYPASS` | OK | `true` | Skip DB lookup for dev login |
| `PORT` | OK | `4000` | Backend port |

### Frontend (`frontend/.env`)

| Variabele | Status | Waarde | Beschrijving |
|-----------|--------|--------|--------------|
| `VITE_API_URL` | OK | `http://localhost:4000` | Backend API URL |
| `VITE_GOOGLE_CLIENT_ID` | OK | `371289174777-...` | Google OAuth Client ID |

---

## WAT WERKT

- [x] Backend start zonder errors
- [x] Frontend start zonder errors
- [x] Prisma client is gegenereerd
- [x] Env variabelen zijn correct geconfigureerd
- [x] Dev login werkt (DEV_AUTH_BYPASS=true)
- [x] Weather API (Open-Meteo) - geen API key nodig

---

## WAT MOET JIJ DOEN (SUPABASE SETUP)

### STAP 1: Maak Supabase Storage Bucket

1. Ga naar https://supabase.com/dashboard
2. Open project `iruwohlhizimfnurownw`
3. Klik links op **Storage**
4. Klik **New bucket**
5. Naam: `photos`
6. **Public bucket**: AAN (toggle aan)
7. Klik **Create bucket**

### STAP 2: Storage Policies instellen

Na het maken van de bucket:

1. Klik op de `photos` bucket
2. Klik op **Policies** tab
3. Klik **New Policy**
4. Kies **For full customization**
5. Maak deze 2 policies:

**Policy 1 - INSERT (upload):**
- Policy name: `Allow authenticated uploads`
- Allowed operation: `INSERT`
- Target roles: `authenticated`
- WITH CHECK expression: `true`

**Policy 2 - SELECT (lezen):**
- Policy name: `Allow public read`
- Allowed operation: `SELECT`
- Target roles: `anon, authenticated`
- USING expression: `true`

### STAP 3: Database tabellen aanmaken

In je terminal:

```bash
cd C:\VSCode\spelen\vissen\backend
npx prisma db push
```

Dit maakt de tabellen aan in Supabase PostgreSQL.

### STAP 4: Google Cloud Console checken

1. Ga naar https://console.cloud.google.com
2. APIs & Services > Credentials
3. Controleer OAuth 2.0 Client ID `371289174777-...`
4. **Authorized JavaScript origins** moet bevatten:
   - `http://localhost:5173`
   - `http://localhost:4000`
5. **Authorized redirect URIs** moet bevatten:
   - `http://localhost:5173`

---

## DE VOLLEDIGE FLOW (DEBUG INFO)

### 1. Google Login
- Frontend: `GoogleLogin` component van `@react-oauth/google`
- Krijgt `idToken` van Google
- Stuurt naar backend `/auth/google/callback`
- Backend verifieert met `google-auth-library`
- Maakt/update user in database
- Geeft JWT token terug

### 2. Google Photos Picker
- Frontend: `useGoogleLogin` met scope `photospicker.mediaitems.readonly`
- Krijgt `access_token` (niet idToken!)
- Stuurt naar backend `/picker/sessions` om sessie te maken
- Opent popup naar Google Photos Picker UI
- Pollt `/picker/sessions/:id` tot user klaar is
- Haalt media items op via `/picker/sessions/:id/media-items`

### 3. Foto Import
- Voor elke geselecteerde foto:
  - Download van Google Photos (tijdelijke URL)
  - Extract EXIF met `exif-parser`
  - Resize met `sharp` (1200px + 300px thumbnail)
  - Upload naar Supabase Storage
  - Haal historisch weer op van Open-Meteo
  - Sla alles op in PostgreSQL

---

## BESTANDEN OVERZICHT

```
backend/
├── .env                          # Env variabelen (NIET COMMITTEN)
├── .env.example                  # Template voor env
├── package.json                  # Dependencies
├── prisma/
│   └── schema.prisma             # Database schema
└── src/
    ├── server.ts                 # Fastify server + routes
    ├── lib/
    │   ├── env.ts                # Zod env parsing
    │   ├── prisma.ts             # Prisma client
    │   ├── jwt.ts                # JWT sign/verify
    │   ├── google.ts             # Google ID token verify
    │   └── supabase.ts           # Supabase Storage client
    ├── modules/
    │   ├── google-photos-picker.ts  # Google Picker API calls
    │   ├── image-processor.ts       # Download, EXIF, resize, upload
    │   ├── photo-store.ts           # Import logic, DB queries
    │   └── weather-api.ts           # Open-Meteo historical weather
    ├── plugins/
    │   └── auth.ts               # Auth middleware
    └── types/
        └── fastify.d.ts          # TypeScript types

frontend/
├── .env                          # Env variabelen
├── package.json                  # Dependencies
└── src/
    ├── App.tsx                   # Main component + alle UI
    └── api.ts                    # Axios instance + token handling
```

---

## MOGELIJKE ERRORS EN OPLOSSINGEN

### Error: "Supabase niet geconfigureerd"
- Check `SUPABASE_URL` en `SUPABASE_ANON_KEY` in `backend/.env`

### Error: "Failed to upload photo: Bucket not found"
- Maak de `photos` bucket in Supabase Storage (zie stap 1)

### Error: "Failed to upload photo: new row violates row-level security"
- Storage policies niet goed ingesteld (zie stap 2)

### Error: "Google Photos Picker API 403"
- Google Cloud Console: enable "Photos Picker API"
- Check OAuth scopes

### Error: "POPUP_BLOCKED"
- Browser blokkeert popup
- Sta pop-ups toe voor localhost

### Error: "Picker timeout"
- Gebruiker klikte niet op "Gereed" in Google Picker
- Of te lang gewacht (max 2 minuten)

---

## COMMANDO'S

```bash
# Start backend
cd backend && npm run dev

# Start frontend
cd frontend && npm run dev

# Of vanuit root:
npm run dev:backend
npm run dev:frontend

# Database sync
cd backend && npx prisma db push

# Prisma client regenereren
cd backend && npx prisma generate

# Database bekijken
cd backend && npx prisma studio
```

---

## WAT IK (CLAUDE) HEB GEDAAN

### Sessie 1 (initieel)
1. `env.ts` aangepast: SUPABASE vars zijn nu optioneel (server crasht niet meer bij startup)
2. `supabase.ts` aangepast: lazy loading, error pas bij gebruik
3. `.env.example` bijgewerkt met Supabase variabelen
4. Dit documentatie bestand gemaakt

### Sessie 2 (2026-03-01) - Google Photos Picker fixes
5. `image-processor.ts`: Authorization header toevoegen bij download van Google Photos URLs (403 fix)
6. `server.ts`: `accessToken` toevoegen aan import-picker-selection endpoint
7. `photo-store.ts`: `accessToken` doorgeven aan downloadAndProcessImage
8. `frontend/App.tsx`: `accessToken` meesturen bij import request
9. `server.ts`: Dev-login maakt nu echte user aan in database (foreign key fix)

---

## VOLGENDE KEER ALS JE HIER VERDER GAAT

Zeg tegen Claude:
> "Lees VISAPP_SETUP.md en help me verder met de Google Photos Picker flow"

Dan weet ik direct waar we zijn.
