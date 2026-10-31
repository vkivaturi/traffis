# =============================================================================
# Stage 1: Build the React 19 + TypeScript + Vite Frontend
# =============================================================================
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend

# Install dependencies first for optimal Docker layer caching
COPY frontend/package*.json ./
RUN npm ci

# Copy frontend source and build static distribution
COPY frontend/ ./

# Optional build argument: inject Google Client ID if provided at build time
ARG VITE_GOOGLE_CLIENT_ID
RUN if [ -n "$VITE_GOOGLE_CLIENT_ID" ]; then echo "VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID" >> .env.production.local; fi && npm run build

# =============================================================================
# Stage 2: Runtime Container (Ubuntu 24.04 LTS + Eclipse SUMO + Python 3.12)
# =============================================================================
FROM ubuntu:24.04 AS runner

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    SUMO_HOME=/usr/share/sumo \
    PATH="/usr/share/sumo/bin:${PATH}"

# Install Eclipse SUMO, Python 3.12, and build tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    sumo \
    sumo-tools \
    python3 \
    python3-pip \
    python3-venv \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Set up Python virtual environment
RUN python3 -m venv /app/.venv
ENV PATH="/app/.venv/bin:${PATH}"

# Install Python requirements
COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt

# Copy backend source code and SUMO configuration
COPY backend /app/backend

# Copy built frontend assets from builder stage
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist

WORKDIR /app/backend

# Pre-compile scenario networks so SUMO is ready immediately on container start
RUN python3 sumo_config/build_network.py

EXPOSE 8000

# Health check to ensure simulation server is responsive
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://127.0.0.1:8000/api/health || exit 1

# Start Traffis backend server (serves REST API, WebSockets, and production SPA)
CMD ["python3", "run.py"]
