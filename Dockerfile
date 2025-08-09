# Use Node.js LTS version with Alpine base for smaller image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# No system dependencies needed for rqlite client

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application files
COPY . .

# Set rqlite connection URL
ENV RQLITE_URL=http://host.docker.internal:4001

# Expose port
EXPOSE 4000

# Set environment variables
ENV NODE_ENV=production
ENV PORT=4000
ENV API_KEY=""
ENV LLM_KEY=""

# Create non-root user (Alpine syntax)
RUN addgroup -g 1001 -S nodejs
RUN adduser -S -D -H -u 1001 -s /sbin/nologin -G nodejs nodejs

# Change ownership of app directory
RUN chown -R nodejs:nodejs /app

# No volume needed - using external rqlite

# Switch to non-root user
USER nodejs

# Start the application
CMD ["npm", "start"]