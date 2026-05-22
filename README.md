# One-Click Deployment Platform

A Vercel-inspired deployment platform that lets users deploy frontend applications with a single API call. Built with Node.js, AWS ECS Fargate, S3, and Redis.

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│   Client    │────▶│  API Server  │────▶│  AWS ECS Fargate │
│  (Frontend) │     │  (Express)   │     │  (Build Server)  │
└─────────────┘     └──────┬───────┘     └────────┬────────┘
                           │                      │
                    ┌──────▼───────┐              │
                    │    Redis     │◀─────────────┘
                    │  (Pub/Sub)   │     (Build Logs)
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐     ┌─────────────────┐
                    │  Socket.IO   │     │    S3 Bucket     │
                    │  (Real-time) │     │  (Static Files)  │
                    └──────────────┘     └────────┬────────┘
                                                  │
                                         ┌────────▼────────┐
                                         │ Reverse Proxy    │
                                         │ (Subdomain → S3) │
                                         └─────────────────┘
```

## How It Works

1. **Deploy Request** — User sends a GitHub repo URL to the API server
2. **Build Task** — API server spins up an ECS Fargate container
3. **Clone & Build** — Container clones the repo, runs `npm install && npm run build`
4. **Upload** — Build artifacts are uploaded to S3
5. **Serve** — Reverse proxy serves the site via subdomain routing (e.g., `my-project.localhost:8000`)
6. **Real-time Logs** — Build logs stream to the client via Redis Pub/Sub + Socket.IO

## Services

| Service | Port | Description |
|---------|------|-------------|
| api-server | 9000 | REST API + WebSocket for deployments and logs |
| build-server | — | Docker container (runs on ECS Fargate) |
| s3-reverse-proxy | 8000 | Serves deployed sites via subdomain routing |
| redis | 6379 | Pub/Sub for real-time build log streaming |

## Tech Stack

- **Runtime:** Node.js 20
- **API Framework:** Express.js
- **Real-time:** Socket.IO + Redis Pub/Sub
- **Cloud:** AWS ECS Fargate, S3
- **Containerization:** Docker
- **Validation:** Zod
- **Security:** Helmet, CORS, Rate Limiting

## Getting Started

### Prerequisites

- Node.js 20+
- Docker & Docker Compose
- AWS Account with ECS and S3 configured
- Redis (or use Docker Compose)

### Setup

```bash
# Clone the repository
git clone https://github.com/your-username/one-click-deployment.git
cd one-click-deployment

# Copy environment variables
cp .env.example .env
# Edit .env with your AWS credentials and configuration

# Start all services with Docker Compose
docker compose up -d

# Or run services individually for development:
cd api-server && npm install && npm run dev
cd s3-reverse-proxy && npm install && npm run dev
```

### Deploy a Project

```bash
curl -X POST http://localhost:9000/project \
  -H "Content-Type: application/json" \
  -d '{"gitURL": "https://github.com/username/repo"}'
```

Response:
```json
{
  "status": "queued",
  "data": {
    "projectSlug": "random-word-slug",
    "url": "http://random-word-slug.localhost:8000"
  }
}
```

### Listen to Build Logs

```javascript
import { io } from "socket.io-client";

const socket = io("http://localhost:9000");
socket.emit("subscribe", "logs:your-project-slug");
socket.on("message", (log) => console.log(log));
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/project` | Deploy a new project |
| GET | `/health` | Health check |

### POST /project

**Body:**
```json
{
  "gitURL": "https://github.com/user/repo",
  "slug": "optional-custom-slug"
}
```

**Validation:**
- `gitURL` — Must be a valid GitHub HTTPS URL
- `slug` — Optional, lowercase alphanumeric with hyphens, 3-50 chars

## Environment Variables

See [`.env.example`](.env.example) for all required configuration.

## Project Structure

```
├── api-server/          # REST API + WebSocket server
│   └── index.js         # Express app with ECS integration
├── build-server/        # Docker build container
│   ├── Dockerfile       # Optimized multi-stage build
│   ├── main.sh          # Entrypoint: clone repo
│   └── script.js        # Build + upload to S3
├── s3-reverse-proxy/    # Static file serving
│   └── index.js         # Subdomain-based routing to S3
├── docker-compose.yml   # Local development orchestration
└── .env.example         # Environment variable template
```

## License

ISC
