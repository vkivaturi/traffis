# Traffis Deployment & Execution Guide

Traffis is a microscopic traffic simulation and visualization platform integrating **Eclipse SUMO**, **Python 3.12 FastAPI** (broadcasting telemetry at 20 Hz / 10 Hz), and a **React 19 + TypeScript HTML5 Canvas** client (60 FPS interpolated rendering).

This guide provides step-by-step instructions for running Traffis in three supported deployment modes:

1. [Mode 1: Local Development with `start.sh`](#mode-1-local-development-with-startsh) (macOS / Linux native)
2. [Mode 2: Local Container with Docker](#mode-2-local-container-with-docker) (Docker Desktop / CLI)
3. [Mode 3: Production on AWS EC2 as a Docker Container](#mode-3-production-on-aws-ec2-as-a-docker-container)

---

## Architecture & Port Summary

| Component | Local Dev (`start.sh`) | Containerized (Docker / EC2) |
| :--- | :--- | :--- |
| **Frontend UI** | Port `5173` (Vite dev server with HMR) | Port `8000` (FastAPI serves built SPA assets at `/`) |
| **REST API** | Port `8000` (`http://127.0.0.1:8000/api/*`) | Port `8000` (`http://<host>:8000/api/*`) |
| **WebSocket** | Port `8000` (`ws://127.0.0.1:8000/ws`) | Port `8000` (`ws://<host>:8000/ws`) |
| **SUMO Engine** | Headless daemon process spawned by TraCI | Headless daemon process spawned by TraCI |

---

## Mode 1: Local Development with `start.sh`

Best for active feature development, frontend hot module reloading (HMR), and modifying SUMO network geometries.

### 1. Prerequisites

- **macOS** (Apple Silicon or Intel) or **Linux** (Ubuntu / Debian / Fedora)
- **Python 3.12+**
- **Node.js 18+** & **npm**
- **Eclipse SUMO 1.20+** installed locally:
  - **macOS (via Homebrew)**:
    ```bash
    brew install sumo
    export SUMO_HOME="$(brew --prefix sumo)/share/sumo"
    export PATH="$(brew --prefix sumo)/bin:$PATH"
    ```
  - **macOS (via Official Framework Package)**:
    ```bash
    export SUMO_HOME="/Library/Frameworks/EclipseSUMO.framework/Versions/Current/EclipseSUMO/share/sumo"
    export PATH="/Library/Frameworks/EclipseSUMO.framework/Versions/Current/EclipseSUMO/bin:$PATH"
    ```
  - **Ubuntu / Debian**:
    ```bash
    sudo apt-get update
    sudo apt-get install -y sumo sumo-tools
    export SUMO_HOME="/usr/share/sumo"
    export PATH="/usr/share/sumo/bin:$PATH"
    ```

### 2. Initial Setup

1. **Clone the repository**:
   ```bash
   git clone <repo-url> traffis
   cd traffis
   ```

2. **Set up the Backend virtual environment**:
   ```bash
   cd backend
   python3 -m venv .venv
   source .venv/bin/activate
   pip install --upgrade pip
   pip install -r requirements.txt
   cd ..
   ```

3. **Install Frontend dependencies**:
   ```bash
   cd frontend
   npm install
   cd ..
   ```

### 3. Launching Traffis

Run the master bootstrap script from the repository root:

- **macOS / Linux**:
  ```bash
  chmod +x start.sh
  ./start.sh
  ```

- **Windows (Command Prompt / PowerShell)**:
  ```cmd
  start.bat
  ```

The script automatically:
1. Validates `SUMO_HOME` and SUMO CLI binaries (`netconvert`, `sumo`).
2. Compiles scenario `.net.xml` road networks if missing.
3. Launches the FastAPI backend daemon on `http://127.0.0.1:8000`.
4. Launches the Vite development server on `http://localhost:5173`.

### 4. Stopping the Application

Press `CTRL + C` in the terminal. The trap handler automatically shuts down the FastAPI process, Vite server, and any running headless SUMO instances.

---

## Mode 2: Local Container with Docker

Best for running the entire application in a clean, self-contained environment without needing to install SUMO, Python, or Node.js on your host machine.

### 1. Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (macOS / Windows) or Docker Engine (Linux).
- Docker daemon must be running.

### 2. Google OAuth Client ID Configuration

> [!IMPORTANT]
> **Build-Time vs. Runtime Behavior**:
> Because the frontend SPA is compiled with Vite (`npm run build`), `VITE_GOOGLE_CLIENT_ID` is inlined directly into the static JavaScript bundle **at image build time**, not container runtime. Setting `-e VITE_GOOGLE_CLIENT_ID=...` or runtime `environment:` in Docker will have no effect on the compiled UI bundle.

- **Will it work normally itself?**
  - **Yes, when building on your local developer machine**: If `frontend/.env` is already present on your workstation, Docker automatically includes it in the build context (`COPY frontend/ ./`), and Vite bakes your client ID into the production bundle.
  - **No, on fresh git clones or servers (e.g. AWS EC2, CI/CD)**: Because `.gitignore` excludes `.env` files, a fresh `git clone` will not have `frontend/.env`. You must provide it via either **Option A** (recommended) or **Option B** before running `docker build` or `docker compose up --build`.

#### Option A: Create `frontend/.env` before building (Recommended)
```bash
cp frontend/.env.example frontend/.env
# Edit frontend/.env with your authorized Google OAuth Client ID:
# VITE_GOOGLE_CLIENT_ID=your_id.apps.googleusercontent.com
```

#### Option B: Pass as a Docker Build Argument
You can inject the client ID during build without committing or creating `.env`:
- **With Docker Compose**:
  ```bash
  VITE_GOOGLE_CLIENT_ID="your_id.apps.googleusercontent.com" docker compose up -d --build
  ```
- **With Docker CLI**:
  ```bash
  docker build --build-arg VITE_GOOGLE_CLIENT_ID="your_id.apps.googleusercontent.com" -t traffis:latest .
  ```

### 3. Method A: Using Docker Compose (Recommended)

1. **Build and start the container in the background**:
   ```bash
   docker compose up -d --build
   ```

2. **View live simulation logs**:
   ```bash
   docker compose logs -f
   ```

3. **Access the application**:
   Open **[http://localhost:8000](http://localhost:8000)** in your browser.

4. **Stop the container**:
   ```bash
   docker compose down
   ```

### 4. Method B: Using Standard Docker CLI

1. **Build the Docker image**:
   ```bash
   docker build -t traffis:latest .
   ```

2. **Run the container**:
   ```bash
   docker run -d \
     --name traffis \
     -p 8000:8000 \
     --restart unless-stopped \
     traffis:latest
   ```

3. **Monitor logs and health**:
   ```bash
   docker logs -f traffis
   docker inspect --format='{{json .State.Health}}' traffis
   ```

4. **Stop and remove container**:
   ```bash
   docker stop traffis
   docker rm traffis
   ```

---

## Mode 3: Production on AWS EC2 as a Docker Container

Best for hosting Traffis publicly for team access, stakeholders, or high-throughput benchmarks.

### 1. Recommended EC2 Instance Specifications

SUMO runs micro-simulation physics in real-time while FastAPI streams 20 Hz state updates over WebSockets:

| Workload | Recommended Instance | vCPUs | RAM | Architecture |
| :--- | :--- | :--- | :--- | :--- |
| **Standard Testing (1–5 concurrent users)** | `t3.medium` or `t4g.medium` | 2 | 4 GB | x86_64 or ARM64 (Graviton) |
| **High Density / Multi-User Production** | `c6i.large` or `c7g.large` | 2 | 4 GB | Compute Optimized |

> **Storage**: 20 GB gp3 root volume is recommended to accommodate Docker images and system packages.

### 2. EC2 Security Group Configuration

Configure your instance's Security Group with the following inbound rules:

| Type | Port | Protocol | Source | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **SSH** | `22` | TCP | `Your-IP/32` | Administrative SSH access |
| **Custom TCP** | `8000` | TCP | `0.0.0.0/0` | Direct Traffis Web & WebSocket port (HTTP/WS) |
| **HTTP** *(Optional)* | `80` | TCP | `0.0.0.0/0` | If running reverse proxy (Nginx / Caddy) |
| **HTTPS** *(Optional)* | `443` | TCP | `0.0.0.0/0` | If SSL certificate is attached (Let's Encrypt) |

---

### 3. Step-by-Step EC2 Setup

#### Step 3.1: Connect to your EC2 Instance
```bash
ssh -i /path/to/your-key.pem ubuntu@<EC2-PUBLIC-IP>
```

#### Step 3.2: Install Docker & Docker Compose
On Ubuntu 24.04 / 22.04 LTS:
```bash
# Update repositories
sudo apt-get update && sudo apt-get install -y ca-certificates curl gnupg

# Add Docker GPG key
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

# Add Docker repository
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker engine and compose plugin
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin git

# Allow your user to run docker without sudo
sudo usermod -aG docker $USER
newgrp docker
```

#### Step 3.3: Clone the Repository and Deploy
```bash
git clone https://github.com/vkivaturi/traffis.git
cd traffis

# Configure Google OAuth Client ID (git clone does not include .env files)
cp frontend/.env.example frontend/.env
# Edit frontend/.env with your authorized Google Web Client ID:
nano frontend/.env

# Launch with Docker Compose
docker compose up -d --build
```

#### Step 3.4: Verify Container Status & Health Check
```bash
docker ps
docker logs -f traffis
```

You can test the backend health endpoint from the instance:
```bash
curl http://localhost:8000/api/health
# Response: {"status":"healthy","uptime_seconds":...,"active_websockets":0}
```

Now open **`http://<EC2-PUBLIC-IP>:8000`** in any web browser!

---

### 4. Production Hardening on EC2 (Optional but Recommended)

#### 4.1 Running on Standard HTTP Port 80
To expose Traffis directly on port 80 instead of 8000, simply adjust the port mapping in `docker-compose.yml`:
```yaml
ports:
  - "80:8000"
```
Then restart the service:
```bash
docker compose up -d
```

#### 4.2 Auto-Starting on System Boot (systemd service)
Ensure Docker starts automatically on EC2 reboot:
```bash
sudo systemctl enable docker
sudo systemctl enable containerd
```
Because `restart: unless-stopped` is specified in `docker-compose.yml`, the Traffis container will automatically start whenever the EC2 instance powers on.

#### 4.3 Setting Up SSL / HTTPS (Let's Encrypt with Caddy)
For domain names (e.g., `traffis.yourdomain.com`), a Caddy reverse proxy automatically provisions and renews SSL certificates:

1. Install Caddy:
   ```bash
   sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
   curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
   curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
   sudo apt update && sudo apt install caddy
   ```

2. Configure `/etc/caddy/Caddyfile`:
   ```caddy
   traffis.yourdomain.com {
       reverse_proxy 127.0.0.1:8000
   }
   ```

3. Reload Caddy:
   ```bash
   sudo systemctl reload caddy
   ```

---

## Environment Variables & Configuration

The application distinguishes between **build-time variables** (baked into the frontend bundle) and **runtime variables** (passed to the Python/SUMO container process):

### 1. Frontend Build-Time Variables (Docker Build Stage)

Must be supplied before or during `docker build` / `docker compose up --build`:

| Variable | Default | Purpose & Usage |
| :--- | :--- | :--- |
| `VITE_GOOGLE_CLIENT_ID` | `""` (empty) | Google OAuth 2.0 Web Client ID. Baked into frontend static bundle via `frontend/.env` or `--build-arg VITE_GOOGLE_CLIENT_ID=...`. |

### 2. Backend Runtime Variables (Container Process)

Can be passed directly via `docker run -e VAR=val` or configured under `environment:` in `docker-compose.yml`:

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `HOST` | `0.0.0.0` | IP interface binding |
| `PORT` | `8000` | Port for FastAPI + WebSocket + UI static assets |
| `SUMO_HOME` | `/usr/share/sumo` | Path to Eclipse SUMO directory |
| `RATE_LIMIT_MB_PER_HOUR` | `250` | Maximum egress bandwidth budget per client hour |
| `DEFAULT_SPEED_KMH` | `50.0` | Default vehicle speed limit across road corridors |

---

## Troubleshooting Guide

### 1. `netconvert binary could not be found`
- **Cause**: SUMO binaries are missing or `SUMO_HOME` is not on your `PATH`.
- **Fix**: Check `which netconvert`. Ensure `SUMO_HOME` points to your SUMO installation (`/usr/share/sumo` on Linux, `/opt/homebrew/share/sumo` on Homebrew macOS).

### 2. WebSocket connection error (`ws://.../ws`) in browser
- **Cause**: Security Group or firewall blocking port `8000`.
- **Fix**: Verify port `8000` is open in EC2 Security Group Inbound Rules. If using an HTTPS domain, ensure the WebSocket uses `wss://` (handled automatically by the React client when on HTTPS).

### 3. Docker build error: `npm ci` fails
- **Cause**: Out of sync `package-lock.json`.
- **Fix**: Run `cd frontend && npm install` locally to update `package-lock.json`, then re-run `docker build`.

### 4. Out of memory on EC2 during `npm run build`
- **Cause**: EC2 instance has less than 2 GB RAM (e.g. `t2.micro` or `t3.nano`).
- **Fix**: Either upgrade to `t3.medium` (recommended) or create a temporary 2 GB swap file:
  ```bash
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  ```
