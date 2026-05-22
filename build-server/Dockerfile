FROM node:20-alpine

# Install git for cloning repositories
RUN apk add --no-cache git

# Create non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /home/app

# Copy dependency files first for better layer caching
COPY package.json package-lock.json ./
RUN npm ci --only=production

# Copy application files
COPY main.sh script.js ./
RUN chmod +x main.sh

# Switch to non-root user
USER appuser

ENTRYPOINT ["/home/app/main.sh"]
