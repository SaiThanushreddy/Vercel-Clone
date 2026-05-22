# One-Click Deployment Platform

A Vercel-inspired deployment platform that lets users deploy frontend applications with a single click. Paste a GitHub URL, hit deploy, and get a live URL with real-time build logs.

Built with Node.js, AWS ECS Fargate, S3, Redis, and Socket.IO.

![Node.js](https://img.shields.io/badge/Node.js-20-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-4.18-000000?logo=express&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)
![AWS](https://img.shields.io/badge/AWS-ECS%20%7C%20S3-FF9900?logo=amazonaws&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-7-DC382D?logo=redis&logoColor=white)

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│   Frontend  │────▶│  API Server  │────▶│  AWS ECS Fargate │
│  (Vanilla)  │     │  (Express)   │     │  (Build Server)  │
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

1. **Deploy Request** — User pastes a GitHub repo URL in the frontend and clicks Deploy
2. **Build Task** — API server validates the input and spins up an ECS Fargate container
3. **Clone & Build** — Container clones the repo (shallow), runs `npm install && npm run build`
4. **Upload** — Build artifacts are uploaded to S3 with correct MIME types
5. **Serve** — Reverse proxy serves the site via subdomain routing (e.g., `my-project.localhost:8000`)
6. **Real-time Logs** — Build logs stream to the frontend via Redis Pub/Sub + Socket.IO

## Features

- One-click deployment from any public GitHub repository
- Real-time build log streaming via WebSocket
- Auto-generated project slugs or custom slugs
- Subdomain-based routing for deployed sites
- Supports Vite, CRA, Next.js static, and other npm-based projects
- Input validation, rate limiting, and security headers
- Dockerized services with health checks
- Graceful shutdown handling

## Services

| Service | Port | Description |
|---------|------|-------------|
| frontend | — | Static HTML/CSS/JS deploy UI |
| api-server | 9000 | REST API + WebSocket for deployments and logs |
| build-server | — | Docker container (runs on ECS Fargate) |
| s3-reverse-proxy | 8000 | Serves deployed sites via subdomain routing |
| redis | 6379 | Pub/Sub for real-time build log streaming |

## Tech Stack

- **Runtime:** Node.js 20
- **Frontend:** Vanilla HTML/CSS/JS (Inter + JetBrains Mono)
- **API Framework:** Express.js
- **Real-time:** Socket.IO + Redis Pub/Sub
- **Cloud:** AWS ECS Fargate, S3
- **Containerization:** Docker, Docker Compose
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
git clone https://github.com/SaiThanushreddy/One-click-Deployment.git
cd One-click-Deployment

# Copy environment variables
cp .env.example .env
# Edit .env with your AWS credentials and configuration

# Start all services with Docker Compose
docker compose up -d

# Or run services individually for development:
cd api-server && npm install && npm run dev
cd s3-reverse-proxy && npm install && npm run dev

# Open the frontend
open frontend/index.html
```

### Deploy a Project

Using the frontend:
1. Open `frontend/index.html` in your browser
2. Paste a GitHub repository URL
3. Click **Deploy**
4. Watch the build logs stream in real-time

Using the API directly:
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

### Listen to Build Logs (Programmatic)

```javascript
import { io } from "socket.io-client";

const socket = io("http://localhost:9000");
socket.emit("subscribe", "logs:your-project-slug");
socket.on("message", (log) => console.log(JSON.parse(log)));
```

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/project` | Deploy a new project |
| GET | `/health` | Health check |

### POST /project

**Request Body:**
```json
{
  "gitURL": "https://github.com/user/repo",
  "slug": "optional-custom-slug"
}
```

**Validation Rules:**
- `gitURL` — Required. Must be a valid GitHub HTTPS URL
- `slug` — Optional. Lowercase alphanumeric with hyphens, 3-50 characters

**Success Response (200):**
```json
{
  "status": "queued",
  "data": { "projectSlug": "...", "url": "..." }
}
```

**Error Response (400):**
```json
{
  "error": "Validation failed",
  "details": ["Must be a valid GitHub repository URL"]
}
```

### GET /health

```json
{
  "status": "ok",
  "uptime": 123.456,
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `AWS_REGION` | AWS region | Yes |
| `AWS_ACCESS_KEY_ID` | AWS access key | Yes |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key | Yes |
| `ECS_CLUSTER` | ECS cluster ARN | Yes |
| `ECS_TASK_DEFINITION` | ECS task definition | Yes |
| `ECS_SUBNETS` | Comma-separated subnet IDs | Yes |
| `ECS_SECURITY_GROUPS` | Comma-separated SG IDs | Yes |
| `REDIS_URL` | Redis connection URL | Yes |
| `S3_BUCKET` | S3 bucket name | Yes |
| `S3_BASE_PATH` | S3 base URL for serving | Yes |
| `API_PORT` | API server port (default: 9000) | No |
| `SOCKET_PORT` | WebSocket port (default: 9002) | No |
| `PROXY_PORT` | Reverse proxy port (default: 8000) | No |
| `ALLOWED_ORIGINS` | CORS origins (comma-separated) | No |

See [`.env.example`](.env.example) for a template.

## Project Structure

```
├── frontend/              # Deploy UI
│   ├── index.html         # Main page
│   ├── style.css          # Styles (dark theme, Inter/JetBrains Mono)
│   └── app.js             # Deploy logic + Socket.IO log streaming
├── api-server/            # REST API + WebSocket server
│   ├── Dockerfile
│   ├── index.js           # Express app with ECS integration
│   └── package.json
├── build-server/          # Docker build container (runs on Fargate)
│   ├── Dockerfile         # node:20-alpine, non-root user
│   ├── main.sh            # Entrypoint: validates env, clones repo
│   ├── script.js          # Builds project + uploads to S3
│   └── .dockerignore
├── s3-reverse-proxy/      # Static file serving
│   ├── Dockerfile
│   ├── index.js           # Subdomain-based routing to S3
│   └── package.json
├── docker-compose.yml     # Local development orchestration
├── .env.example           # Environment variable template
└── .gitignore
```

## License

ISC
