# Use Node.js LTS version
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application files
COPY . .

# Create directory for database
RUN mkdir -p /app/data

# Set database path for initialization
ENV DB_PATH=/app/data/traffic.db

# Initialize database
RUN npm run init-db

# Expose port
EXPOSE 4000

# Set environment variables
ENV NODE_ENV=production
ENV PORT=4000
ENV API_KEY=""
ENV LLM_KEY=""

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Change ownership of app directory
RUN chown -R nodejs:nodejs /app

# Add volume for persistent database storage
VOLUME ["/app/data"]

# Switch to non-root user
USER nodejs

# Start the application
CMD ["npm", "start"]