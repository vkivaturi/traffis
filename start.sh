#!/usr/bin/env bash
set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export SUMO_HOME="${SUMO_HOME:-/Library/Frameworks/EclipseSUMO.framework/Versions/Current/EclipseSUMO/share/sumo}"
export PATH="/opt/homebrew/bin:/Library/Frameworks/EclipseSUMO.framework/Versions/Current/EclipseSUMO/bin:$PATH"

echo "=================================================="
echo "    TRAFFIS: Real-Time SUMO Traffic Simulation    "
echo "=================================================="
echo "SUMO_HOME: $SUMO_HOME"

# 1. Compile SUMO Network if not compiled
if [ ! -f "$PROJECT_ROOT/backend/sumo_config/road.net.xml" ]; then
    echo "Compiling 1000m 3-lane road network with netconvert..."
    "$PROJECT_ROOT/backend/.venv/bin/python" "$PROJECT_ROOT/backend/sumo_config/build_network.py"
fi

# Function to clean up on CTRL+C
cleanup() {
    echo ""
    echo "Stopping Traffis backend and frontend..."
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
    wait $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
    echo "Traffis stopped successfully."
}
trap cleanup SIGINT SIGTERM EXIT

# 2. Launch FastAPI Backend
echo "Starting FastAPI Backend on http://127.0.0.1:8000..."
cd "$PROJECT_ROOT/backend"
"$PROJECT_ROOT/backend/.venv/bin/python" run.py &
BACKEND_PID=$!

# Wait for backend to be ready
sleep 2

# 3. Launch Vite Frontend
echo "Starting Vite Frontend on http://127.0.0.1:5173..."
cd "$PROJECT_ROOT/frontend"
npm run dev -- --host 0.0.0.0 --port 5173 &
FRONTEND_PID=$!

echo ""
echo "Traffis is running!"
echo " Frontend: http://localhost:5173"
echo " Backend API: http://127.0.0.1:8000"
echo " WebSocket: ws://127.0.0.1:8000/ws"
echo ""
echo "Press CTRL+C to stop all servers."

wait
