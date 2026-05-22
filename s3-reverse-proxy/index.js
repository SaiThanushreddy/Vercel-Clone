require('dotenv').config();

const express = require('express');
const httpProxy = require('http-proxy');

// --- Config ---
const PORT = parseInt(process.env.PROXY_PORT) || 8000;
const BASE_PATH = process.env.S3_BASE_PATH;

if (!BASE_PATH) {
  console.error('[Proxy] Missing required environment variable: S3_BASE_PATH');
  process.exit(1);
}

const app = express();
const proxy = httpProxy.createProxyServer();

// --- Health check ---
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// --- Proxy middleware ---
app.use((req, res) => {
  const hostname = req.hostname;
  const subdomain = hostname.split('.')[0];

  if (!subdomain || subdomain === hostname) {
    return res.status(400).json({ error: 'Invalid subdomain' });
  }

  const target = `${BASE_PATH}/${subdomain}`;

  proxy.web(req, res, { target, changeOrigin: true });
});

// --- Rewrite requests to append index.html for root paths ---
proxy.on('proxyReq', (proxyReq, req, res) => {
  const url = req.url;
  if (url === '/') {
    proxyReq.path += 'index.html';
  }
});

// --- Handle proxy errors ---
proxy.on('error', (err, req, res) => {
  console.error(`[Proxy] Error for ${req.hostname}${req.url}:`, err.message);

  if (!res.headersSent) {
    res.status(502).json({
      error: 'Deployment not found or unavailable',
      subdomain: req.hostname.split('.')[0],
    });
  }
});

// --- Graceful shutdown ---
function gracefulShutdown(signal) {
  console.log(`\n[Proxy] ${signal} received. Shutting down...`);
  proxy.close();
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// --- Start ---
app.listen(PORT, () => {
  console.log(`[Proxy] Reverse proxy running on port ${PORT}`);
  console.log(`[Proxy] Serving from: ${BASE_PATH}`);
});
