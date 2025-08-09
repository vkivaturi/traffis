# Traffis - Traffic Monitoring System

A real-time traffic monitoring system that displays traffic events on an interactive OpenStreetMap using markers with different colors to indicate traffic conditions.

## Features

- **Interactive Map**: OpenStreetMap integration with Leaflet.js
- **Real-time Updates**: Automatic refresh every 30 seconds
- **Color-coded Markers**: Visual indication of traffic conditions
  - 🟢 Green: Normal traffic
  - 🟡 Yellow: Slow traffic
  - 🔴 Red: Very slow traffic
  - 🟠 Orange: Warning/Alert
- **Event Details**: Click markers to view detailed information
- **REST API**: Full CRUD operations for traffic events
- **SQLite Database**: Lightweight, file-based storage

## Prerequisites

- Node.js (v14 or higher)
- npm (Node Package Manager)

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

1. Initialize the database with sample data:
   ```bash
   npm run init-db
   ```

## Running the Application

1. Start the server:
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

## Project Structure

```
traffis/
├── schema.sql          # Database schema
├── init_db.js         # Database initialization script
├── server.js          # Express.js API server
├── map.html           # Frontend map interface
├── package.json       # Node.js dependencies
├── .gitignore         # Git ignore rules
└── README.md          # This file
```

## Technologies Used

- **Backend**: Node.js, Express.js, SQLite3
- **Frontend**: HTML5, JavaScript (ES6+), Leaflet.js
- **Map**: OpenStreetMap tiles
- **Database**: SQLite

## Usage

1. **View Traffic Events**: Navigate to http://localhost:4000 to see the interactive map
2. **Legend**: The map includes a color-coded legend showing traffic status meanings
3. **Real-time Updates**: Events refresh automatically every 30 seconds
4. **Event Details**: Click on any marker to view detailed event information

## Database Configuration

The database location can be configured using the `DB_PATH` environment variable:

### Local Development
- **Default**: Uses `traffic.db` in the current directory
- **Custom location**: 
  ```bash
  DB_PATH=/path/to/your/database.db npm start
  ```

### Docker/EC2 Deployment
- Database is stored in `/app/data/traffic.db` inside the container
- Mount external directory for persistence:
  ```bash
  docker run -v /host/path:/app/data -p 4000:4000 traffis
  ```
- On EC2, mount an EBS volume or local directory to persist data between container restarts

## Deployment

### Local Deployment
The application is fully self-contained:
- All HTML, CSS, and JavaScript are served from the server
- No separate static files needed
- Single port deployment (4000)
- Database file created automatically

### Docker Deployment

#### 1. Build the Docker Image
```bash
docker build -t traffis .
```

#### 2. Run with Environment Variables
The application requires three environment variables:
- `API_KEY`: Authentication key for API endpoints
- `LLM_KEY`: Authentication key for LLM service
- `DB_PATH`: Database file path (optional, defaults to `/app/data/traffic.db`)

**Basic run command:**
```bash
docker run -d \
  -p 4000:4000 \
  -v $(pwd)/data:/app/data \
  -e API_KEY="your-api-key-here" \
  -e LLM_KEY="your-llm-key-here" \
  --name traffis \
  traffis
```

**Alternative with .env file:**
```bash
# Create .env file
cat > .env << EOF
API_KEY=your-api-key-here
LLM_KEY=your-llm-key-here
DB_PATH=/app/data/traffic.db
EOF

# Run container
docker run -d \
  -p 4000:4000 \
  -v $(pwd)/data:/app/data \
  --env-file .env \
  --name traffis \
  traffis
```

### EC2 Deployment

#### 1. Prepare Environment
```bash
# Create directory for database persistence
mkdir -p /opt/traffis/data

# Create environment file with your keys
sudo tee /opt/traffis/.env << EOF
API_KEY=your-api-key-here
LLM_KEY=your-llm-key-here
DB_PATH=/app/data/traffic.db
EOF
```

#### 2. Build and Run Container
```bash
# Clone repository
git clone <repository-url>
cd traffis

# Build image
docker build -t traffis .

# Run container with persistent storage and environment variables
docker run -d \
  -p 4000:4000 \
  -v /opt/traffis/data:/app/data \
  --env-file /opt/traffis/.env \
  --name traffis \
  --restart unless-stopped \
  traffis
```

#### 3. Verify Deployment
```bash
# Check container status
docker ps

# View logs
docker logs traffis

# Test application
curl http://localhost:4000
```

## API Integration

- Frontend uses relative URLs (`/api/events`) 
- No CORS issues since everything is served from the same origin
- Simplified deployment and packaging