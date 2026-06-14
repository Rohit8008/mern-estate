# Docker Setup

Single-container production build. The frontend is compiled inside Docker and served as static files by the Express backend — no separate frontend container or nginx required.

## How it works

```
docker compose up --build
        │
        ├─ Stage 1 (node:20-alpine)
        │    npm ci → vite build → /frontend/dist
        │
        └─ Stage 2 (node:20-alpine)
             npm ci --omit=dev
             backend source + /frontend/dist
             node index.js → http://localhost:3000
                  │
                  ├─ /api/*        →  Express routes
                  └─ /*            →  React SPA (static)
```

MongoDB stays on Atlas (external). Uploaded files are persisted via a named Docker volume.

---

## Prerequisites

- Docker Desktop (Mac/Windows) or Docker Engine + Compose plugin (Linux)
- Your existing `backend/.env` with real values for `MONGO_URI`, `JWT_SECRET`, `REFRESH_SECRET`
- Firebase project credentials (baked into the frontend bundle at build time)

---

## First-time setup

### 1. Create the root `.env` for Firebase build args

```bash
cp .env.example .env
```

Fill in your Firebase values (same ones in `frontend/.env.local`):

```env
VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123...
VITE_FIREBASE_MEASUREMENT_ID=G-...
```

These are read by `docker-compose.yml` as build args and baked into the Vite bundle. They are **not** secret — they're already in the browser bundle.

### 2. Update `backend/.env` for Docker

Two values need changing from their dev defaults:

```env
# Already set correctly — docker-compose overrides NODE_ENV and FRONTEND_URL,
# but make sure OPENOBSERVE_URL points to the host, not localhost:

# Mac / Windows:
OPENOBSERVE_URL=http://host.docker.internal:5080

# Linux (use your machine's LAN IP, e.g.):
OPENOBSERVE_URL=http://192.168.1.x:5080
```

> **Why not `localhost:5080` inside Docker?**  
> Inside a container, `localhost` is the container itself. `host.docker.internal` is a special hostname that resolves to the host machine on Mac and Windows. On Linux, use your machine's IP instead.

Everything else in `backend/.env` (Mongo URI, JWT secrets, Firebase API key, SMTP, etc.) works as-is.

---

## Running

```bash
# Build image and start
docker compose up --build

# Start without rebuilding (after first build)
docker compose up

# Run in background
docker compose up -d

# Stop
docker compose down

# Stop and delete volumes (⚠ deletes uploaded files)
docker compose down -v
```

App is available at **http://localhost:3000**.

---

## Rebuilding after changes

| Change | Action needed |
|--------|--------------|
| Backend source code | `docker compose up --build` |
| Frontend source code | `docker compose up --build` |
| Firebase env vars (`.env`) | `docker compose build` then `up` |
| `backend/.env` secrets | `docker compose up` (no rebuild — env_file is read at runtime) |
| `package.json` dependencies | `docker compose build --no-cache` |

Firebase vars are **baked in at build time** — changing `.env` requires a rebuild.  
Backend secrets are **injected at runtime** via `env_file` — changing `backend/.env` only needs a restart.

---

## Volumes

| Volume | Mount path | Purpose |
|--------|-----------|---------|
| `uploads_data` | `/app/uploads` | User-uploaded files (persists across restarts) |

To back up uploads:

```bash
docker run --rm -v mern-estate_uploads_data:/data -v $(pwd):/backup alpine \
  tar czf /backup/uploads-backup.tar.gz -C /data .
```

---

## Optional: run OpenObserve as a compose service

Instead of running OpenObserve separately on your host, you can have compose manage it. Uncomment the `openobserve` block in `docker-compose.yml` and change `OPENOBSERVE_URL`:

```yaml
# In docker-compose.yml environment section:
OPENOBSERVE_URL: http://openobserve:5080

# Then uncomment:
openobserve:
  image: public.ecr.aws/zinclabs/openobserve:latest
  environment:
    ZO_ROOT_USER_EMAIL: admin@example.com
    ZO_ROOT_USER_PASSWORD: Password@123
    ZO_DATA_DIR: /data
  ports:
    - "5080:5080"
  volumes:
    - openobserve_data:/data
```

Also uncomment `openobserve_data` under `volumes:`.

---

## Useful commands

```bash
# View logs
docker compose logs -f

# View only app logs
docker compose logs -f app

# Open a shell inside the running container
docker exec -it $(docker compose ps -q app) sh

# Check environment variables inside container
docker exec $(docker compose ps -q app) env | grep -v SECRET | grep -v PASSWORD

# Run database seed scripts inside container
docker exec $(docker compose ps -q app) node scripts/seedCategories.js

# Create first admin user
docker exec -it $(docker compose ps -q app) node scripts/makeAdmin.js
```

---

## Troubleshooting

**`ECONNREFUSED` connecting to OpenObserve**  
On Linux, `host.docker.internal` is not automatically available. Set `OPENOBSERVE_URL` to your machine's LAN IP in `backend/.env`, or run OpenObserve as a compose service (see above).

**Firebase image uploads fail**  
The VITE_FIREBASE_* vars were either missing from `.env` at build time or have wrong values. Check the browser console for the Firebase error, then rebuild:
```bash
docker compose build --no-cache && docker compose up
```

**Port 3000 already in use**  
Your local backend dev server is running. Stop it first (`Ctrl+C` in the backend terminal) or change the host port in `docker-compose.yml`:
```yaml
ports:
  - "3001:3000"   # access at http://localhost:3001
```

**`Cannot find module` errors on startup**  
The `node_modules` inside the container is independent of your local one. Force a clean rebuild:
```bash
docker compose build --no-cache
```
