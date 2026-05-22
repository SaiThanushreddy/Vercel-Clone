require('dotenv').config();

const express = require('express');
const { generateSlug } = require('random-word-slugs');
const { ECSClient, RunTaskCommand } = require('@aws-sdk/client-ecs');
const { Server } = require('socket.io');
const Redis = require('ioredis');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const http = require('http');

// --- Config validation ---
const requiredEnvVars = [
  'AWS_REGION',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'ECS_CLUSTER',
  'ECS_TASK_DEFINITION',
  'ECS_SUBNETS',
  'ECS_SECURITY_GROUPS',
  'REDIS_URL',
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

const config = {
  port: parseInt(process.env.API_PORT) || 9000,
  socketPort: parseInt(process.env.SOCKET_PORT) || 9002,
  allowedOrigins: (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(','),
  aws: {
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  },
  ecs: {
    cluster: process.env.ECS_CLUSTER,
    taskDefinition: process.env.ECS_TASK_DEFINITION,
    subnets: process.env.ECS_SUBNETS.split(','),
    securityGroups: process.env.ECS_SECURITY_GROUPS.split(','),
    containerName: process.env.ECS_CONTAINER_NAME || 'builder-image',
  },
  redis: {
    url: process.env.REDIS_URL,
  },
};

// --- Input validation schema ---
const projectSchema = z.object({
  gitURL: z
    .string()
    .url()
    .regex(/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+(\.git)?$/, {
      message: 'Must be a valid GitHub repository URL',
    }),
  slug: z
    .string()
    .regex(/^[a-z0-9-]+$/, { message: 'Slug must be lowercase alphanumeric with hyphens' })
    .min(3)
    .max(50)
    .optional(),
});

// --- Initialize services ---
const app = express();
const server = http.createServer(app);

const subscriber = new Redis(config.redis.url, {
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    if (times > 3) return null;
    return Math.min(times * 200, 2000);
  },
});

subscriber.on('error', (err) => {
  console.error('[Redis] Connection error:', err.message);
});

subscriber.on('connect', () => {
  console.log('[Redis] Connected successfully');
});

const io = new Server(server, {
  cors: {
    origin: config.allowedOrigins,
    methods: ['GET', 'POST'],
  },
});

const ecsClient = new ECSClient({
  region: config.aws.region,
  credentials: config.aws.credentials,
});

// --- Middleware ---
app.use(helmet());
app.use(cors({ origin: config.allowedOrigins }));
app.use(express.json({ limit: '1mb' }));

const deployLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  message: { error: 'Too many deployment requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

// --- Routes ---
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

app.post('/project', deployLimiter, async (req, res) => {
  try {
    const validation = projectSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validation.error.issues.map((i) => i.message),
      });
    }

    const { gitURL, slug } = validation.data;
    const projectSlug = slug || generateSlug();

    const command = new RunTaskCommand({
      cluster: config.ecs.cluster,
      taskDefinition: config.ecs.taskDefinition,
      launchType: 'FARGATE',
      count: 1,
      networkConfiguration: {
        awsvpcConfiguration: {
          assignPublicIp: 'ENABLED',
          subnets: config.ecs.subnets,
          securityGroups: config.ecs.securityGroups,
        },
      },
      overrides: {
        containerOverrides: [
          {
            name: config.ecs.containerName,
            environment: [
              { name: 'GIT_REPOSITORY__URL', value: gitURL },
              { name: 'PROJECT_ID', value: projectSlug },
            ],
          },
        ],
      },
    });

    await ecsClient.send(command);

    console.log(`[Deploy] Task queued: ${projectSlug} from ${gitURL}`);

    return res.json({
      status: 'queued',
      data: {
        projectSlug,
        url: `http://${projectSlug}.localhost:8000`,
      },
    });
  } catch (err) {
    console.error('[Deploy] Failed to start task:', err.message);
    return res.status(500).json({ error: 'Failed to queue deployment' });
  }
});

// --- Socket.IO ---
io.on('connection', (socket) => {
  socket.on('subscribe', (channel) => {
    if (typeof channel !== 'string' || !channel.startsWith('logs:')) {
      socket.emit('error', 'Invalid channel format');
      return;
    }
    socket.join(channel);
    socket.emit('message', `Joined ${channel}`);
  });
});

// --- Redis log subscription ---
async function initRedisSubscribe() {
  subscriber.psubscribe('logs:*');
  subscriber.on('pmessage', (pattern, channel, message) => {
    io.to(channel).emit('message', message);
  });
  console.log('[Redis] Subscribed to build logs');
}

// --- Graceful shutdown ---
function gracefulShutdown(signal) {
  console.log(`\n[Server] ${signal} received. Shutting down gracefully...`);

  server.close(() => {
    console.log('[Server] HTTP server closed');
    subscriber.disconnect();
    console.log('[Redis] Disconnected');
    process.exit(0);
  });

  // Force exit after 10s
  setTimeout(() => {
    console.error('[Server] Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// --- Start server ---
initRedisSubscribe();

server.listen(config.port, () => {
  console.log(`[Server] API running on port ${config.port}`);
  console.log(`[Server] WebSocket running on port ${config.port}`);
  console.log(`[Server] Environment: ${process.env.NODE_ENV || 'development'}`);
});
