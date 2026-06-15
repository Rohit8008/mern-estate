# ─── Stage 1: build the frontend ────────────────────────────────────────────
FROM node:20-alpine AS frontend-builder

WORKDIR /build/frontend

# Install deps first (cache layer)
COPY frontend/package*.json ./
RUN npm ci --legacy-peer-deps

# Build args for VITE_* vars — baked in at build time
ARG VITE_CLOUDINARY_CLOUD_NAME
ARG VITE_CLOUDINARY_UPLOAD_PRESET
ARG VITE_API_URL=""
ARG VITE_SOCKET_URL=""

COPY frontend/ ./
RUN npm run build

# ─── Stage 2: production backend ─────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

# Install production deps only
COPY backend/package*.json ./
RUN npm ci --omit=dev

# Copy backend source
COPY backend/ ./

# Copy built frontend into the path the backend expects
COPY --from=frontend-builder /build/frontend/dist ./frontend/dist

# Persistent upload storage (mount a volume over this in production)
RUN mkdir -p uploads

EXPOSE 3000

ENV NODE_ENV=production

CMD ["node", "index.js"]
