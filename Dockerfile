# Targets
#   (default)            full image: API + built frontend served by Express.
#                        This is what docker-compose.yml builds. Unchanged.
#   --target api         API only, no frontend/dist. For the ECS/CloudFront
#                        layout where the SPA lives in S3 (see deploy/aws/).
#
#   docker build -t estate .                    # full
#   docker build --target api -t estate-api .   # API only
#
# Base image: node 20 is required (Node 25 breaks the jsonwebtoken chain).
# `20.19-alpine` is a floating minor tag that receives patch updates; pin to a
# digest (node:20.19-alpine@sha256:...) in release builds if you want fully
# reproducible images.

# ─── Stage 1: build the frontend ────────────────────────────────────────────
FROM node:20.19-alpine AS frontend-builder

WORKDIR /build/frontend

# Install deps first (cache layer)
COPY frontend/package*.json ./
RUN npm ci --legacy-peer-deps

# Build args for VITE_* vars — baked in at build time (they end up in the public
# bundle: never pass a real secret here other than the response key, which the
# browser needs by design).
ARG VITE_CLOUDINARY_CLOUD_NAME
ARG VITE_CLOUDINARY_UPLOAD_PRESET
ARG VITE_API_URL=""
ARG VITE_SOCKET_URL=""
# Canonical origin for canonicals, sitemap.xml and robots.txt (SEO build).
ARG VITE_SITE_URL
# Must equal API_RESPONSE_SECRET on the server when ENCRYPT_API_RESPONSES=true.
ARG VITE_API_RESPONSE_SECRET

# Declared ARGs are exported to RUN commands automatically; an ARG that was not
# passed stays UNSET (not empty), so Vite's own defaults still apply.
COPY frontend/ ./
RUN npm run build

# ─── Stage 2: backend runtime (shared by both targets) ───────────────────────
FROM node:20.19-alpine AS runtime

# tini as PID 1: forwards SIGTERM to node (graceful drain in index.js) and
# reaps zombies. Node as PID 1 does neither reliably.
RUN apk add --no-cache tini

WORKDIR /app

# Install production deps only
COPY --chown=node:node backend/package*.json ./
RUN npm ci --omit=dev && chown -R node:node node_modules

# Copy backend source. --chown here instead of a later `chown -R /app`, which
# duplicated every file into a second layer.
COPY --chown=node:node backend/ ./

# utils/version.js looks for VERSION one level above utils/ (the app root here).
# It lives at the repo root, outside backend/, so health would say 0.0.0-unknown.
COPY --chown=node:node VERSION ./VERSION

# Persistent upload storage (mount a volume over this in production).
# Created owned by node: it is the one directory the app writes at runtime.
# A volume mounted over it must be writable by uid 1000.
RUN mkdir -p uploads && chown node:node uploads

# Drop root (node:alpine ships a `node` user, uid 1000).
USER node

ENV NODE_ENV=production
# V8 heap cap. Tune to roughly 75% of the container memory limit
# (700 here assumes ~1 GB). Without it node sizes the heap from host RAM and
# the container is OOM-killed instead of failing with a clean heap error.
ENV NODE_OPTIONS=--max-old-space-size=700

EXPOSE 3000

# Liveness only (/live does not touch Mongo), so a DB blip does not restart the
# container. busybox wget is present in alpine. 127.0.0.1, not localhost: alpine
# resolves localhost to ::1 first and the server may bind IPv4 only.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT:-3000}/api/health/live || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "index.js"]

# ─── Target: api (no frontend) ───────────────────────────────────────────────
FROM runtime AS api

# ─── Target: full (DEFAULT — must stay the last stage) ───────────────────────
FROM runtime AS full

# Built frontend, into the path the backend expects.
COPY --from=frontend-builder --chown=node:node /build/frontend/dist ./frontend/dist
