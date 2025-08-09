# Traffis - Traffic Monitoring System

A real-time traffic monitoring system that displays traffic events on an interactive OpenStreetMap using markers with different colors to indicate traffic conditions.

## Features

- **Interactive Map**: OpenStreetMap integration with Leaflet.js
- **Real-time Updates**: Automatic refresh every 30 seconds
- **Color-coded Markers**: Visual indication of traffic conditions
- **Event Details**: Click markers to view detailed information
- **REST API**: Full CRUD operations for traffic events
- **rqlite Database**: Distributed SQLite with HTTP API

## Prerequisites

- Node.js (v14 or higher)
- npm (Node Package Manager)
- rqlite server running on port 4001

## Installation

1. Clone or download the project
2. Navigate to the project directory:
   ```bash
   cd traffis
   ```

3. Install dependencies:
   ```bash
   npm install
   ```

## Setup

1. Start rqlite server:
   ```bash
   rqlited ~/node.1
   ```
   rqlite will run on http://localhost:4001

2. Initialize the database with sample data:
   ```bash
   RQLITE_URL=http://localhost:4001 npm run init-db
   ```

## Running the Application

1. Set environment variables:
   ```bash
   export API_KEY="your-api-key-here"
   export LLM_KEY="your-llm-key-here"
   export RQLITE_URL="http://localhost:4001"
   ```

2. Start the server:
   ```bash
   npm start
   ```
   The server will run on http://localhost:4000

2. Open your web browser and navigate to http://localhost:4000 to view the interactive map

**Note**: The entire application is now served through the Node.js server. You don't need to open separate HTML files.

## Development

For development with auto-restart:
```bash
npm run dev
```

## Database Schema

The `events` table contains:
- `id`: Auto-increment primary key
- `lat`: Latitude coordinate
- `long`: Longitude coordinate  
- `created_time`: When the record was inserted (auto-generated)
- `start_time`: When the event starts
- `end_time`: When the event ends (null for ongoing events)
- `note`: Description/notes about the event
- `type`: Traffic type (`normal`, `slow traffic`, `very slow traffic`, `warning`)

## API Endpoints

### GET /api/events
Retrieve all active events (where end_time is null or in the future)

### POST /api/events
Create a new traffic event
```json
{
  "lat": 17.415275,
  "long": 78.481654,
  "start_time": "2024-01-01T10:00:00Z",
  "end_time": "2024-01-01T12:00:00Z",
  "note": "Heavy traffic due to construction",
  "type": "very slow traffic"
}
```

### DELETE /api/events/:id
Delete a specific event by ID

## Technologies Used

- **Backend**: Node.js, Express.js, node-fetch
- **Frontend**: HTML5, JavaScript (ES6+), Leaflet.js
- **Map**: OpenStreetMap tiles
- **Database**: rqlite (distributed SQLite)

## Usage

1. **View Traffic Events**: Navigate to http://localhost:4000 to see the interactive map
2. **Legend**: The map includes a color-coded legend showing traffic status meanings
3. **Real-time Updates**: Events refresh automatically every 30 seconds
4. **Event Details**: Click on any marker to view detailed event information

## Database Configuration

The application connects to rqlite using the `RQLITE_URL` environment variable:

### Local Development
- **Default**: `http://localhost:4001`
- **Custom location**: 
  ```bash
  RQLITE_URL=http://your-rqlite-host:4001 npm start
  ```

### Docker/Network Deployment
- Use `host.docker.internal:4001` to connect to rqlite running on host
- For production, use actual IP/hostname of rqlite server

## Deployment

### Local Deployment
The application is fully self-contained:
- All HTML, CSS, and JavaScript are served from the server
- No separate static files needed
- Single port deployment (4000)
- Database file created automatically

### Docker Deployment

#### 1. Start rqlite server
```bash
# Run rqlite in a container
docker run -d \
  -p 4001:4001 \
  --name rqlite \
  rqlite/rqlite:latest
```

#### 2. Build the traffis Docker Image
```bash
docker build -t traffis .
```

#### 3. Run traffis container
The application requires three environment variables:
- `API_KEY`: Authentication key for API endpoints
- `LLM_KEY`: Authentication key for LLM service
- `RQLITE_URL`: URL to rqlite server (defaults to `http://host.docker.internal:4001`)

**Basic run command:**
```bash
docker run -d \
  -p 4000:4000 \
  -e API_KEY="your-api-key-here" \
  -e LLM_KEY="your-llm-key-here" \
  --name traffis \
  traffis
```

**With .env file:**
```bash
# Create .env file
cat > .env << EOF
API_KEY=your-api-key-here
LLM_KEY=your-llm-key-here
RQLITE_URL=http://host.docker.internal:4001
EOF

# Run container
docker run -d \
  -p 4000:4000 \
  --env-file .env \
  --name traffis \
  traffis
```

**Using Docker Compose (recommended):**
```yaml
# docker-compose.yml
version: '3.8'
services:
  rqlite:
    image: rqlite/rqlite:latest
    ports:
      - "4001:4001"
    volumes:
      - rqlite_data:/rqlite/file
  
  traffis:
    build: .
    ports:
      - "4000:4000"
    environment:
      - API_KEY=your-api-key-here
      - LLM_KEY=your-llm-key-here
      - RQLITE_URL=http://rqlite:4001
    depends_on:
      - rqlite

volumes:
  rqlite_data:
```

```bash
# Run with docker-compose
docker-compose up -d
```

### EC2 Deployment

#### 1. Prepare Environment
```bash
# Create environment file with your keys
sudo tee /opt/traffis/.env << EOF
API_KEY=your-api-key-here
LLM_KEY=your-llm-key-here
RQLITE_URL=http://localhost:4001
EOF
```

#### 2. Start rqlite server
```bash
# Install and start rqlite
wget https://github.com/rqlite/rqlite/releases/download/v7.21.4/rqlite-v7.21.4-linux-amd64.tar.gz
tar xzf rqlite-v7.21.4-linux-amd64.tar.gz
sudo mv rqlite-v7.21.4-linux-amd64/rqlited /usr/local/bin/

# Create data directory
sudo mkdir -p /opt/rqlite/data

# Start rqlite as service
sudo systemd create rqlite.service
# or run directly:
nohup rqlited -http-addr 0.0.0.0:4001 /opt/rqlite/data &
```

#### 3. Build and Run traffis Container
```bash
# Clone repository
git clone <repository-url>
cd traffis

# Build image
docker build -t traffis .

# Run container
docker run -d \
  -p 4000:4000 \
  --env-file /opt/traffis/.env \
  --name traffis \
  --restart unless-stopped \
  traffis
```

#### 4. Initialize Database
```bash
# Initialize the rqlite database with sample data
docker exec traffis npm run init-db
```

#### 5. Verify Deployment
```bash
# Check container status
docker ps

# View logs
docker logs traffis
docker logs rqlite  # if using docker rqlite

# Test rqlite connection
curl http://localhost:4001/status

# Test application
curl http://localhost:4000
```

## API Integration

- Frontend uses relative URLs (`/api/events`) 
- No CORS issues since everything is served from the same origin
- Simplified deployment and packaging