const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const mime = require('mime-types');
const Redis = require('ioredis');

// --- Config from environment ---
const PROJECT_ID = process.env.PROJECT_ID;
const REDIS_URL = process.env.REDIS_URL;
const S3_BUCKET = process.env.S3_BUCKET;
const AWS_REGION = process.env.AWS_REGION;

if (!PROJECT_ID || !REDIS_URL || !S3_BUCKET || !AWS_REGION) {
  console.error('[Build] Missing required environment variables: PROJECT_ID, REDIS_URL, S3_BUCKET, AWS_REGION');
  process.exit(1);
}

const publisher = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    if (times > 3) return null;
    return Math.min(times * 200, 2000);
  },
});

const s3Client = new S3Client({
  region: AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

function publishLog(log) {
  publisher.publish(`logs:${PROJECT_ID}`, JSON.stringify({ log }));
}

/**
 * Finds the build output directory.
 * Supports common frameworks: dist/ (Vite), build/ (CRA), out/ (Next.js static), .next/ (Next.js)
 */
function findOutputDir(basePath) {
  const candidates = ['dist', 'build', 'out', '.next'];
  for (const dir of candidates) {
    const fullPath = path.join(basePath, dir);
    if (fs.existsSync(fullPath) && fs.lstatSync(fullPath).isDirectory()) {
      return fullPath;
    }
  }
  return null;
}

/**
 * Recursively get all files in a directory
 */
function getAllFiles(dirPath, arrayOfFiles = []) {
  const files = fs.readdirSync(dirPath);

  for (const file of files) {
    const filePath = path.join(dirPath, file);
    if (fs.lstatSync(filePath).isDirectory()) {
      getAllFiles(filePath, arrayOfFiles);
    } else {
      arrayOfFiles.push(filePath);
    }
  }

  return arrayOfFiles;
}

async function init() {
  console.log(`[Build] Starting build for project: ${PROJECT_ID}`);
  publishLog('Build started...');

  const outDirPath = path.join(__dirname, 'output');

  if (!fs.existsSync(outDirPath)) {
    console.error('[Build] Output directory not found. Clone may have failed.');
    publishLog('Error: Repository clone failed');
    await cleanup(1);
    return;
  }

  const p = exec(`cd ${outDirPath} && npm install && npm run build`);

  p.stdout.on('data', (data) => {
    const line = data.toString().trim();
    if (line) {
      console.log(`[Build] ${line}`);
      publishLog(line);
    }
  });

  p.stderr.on('data', (data) => {
    const line = data.toString().trim();
    if (line) {
      console.error(`[Build:stderr] ${line}`);
      publishLog(`stderr: ${line}`);
    }
  });

  p.on('close', async (code) => {
    if (code !== 0) {
      console.error(`[Build] Build process exited with code ${code}`);
      publishLog(`Build failed with exit code ${code}`);
      await cleanup(1);
      return;
    }

    console.log('[Build] Build completed successfully');
    publishLog('Build complete. Uploading artifacts...');

    const outputDir = findOutputDir(outDirPath);
    if (!outputDir) {
      console.error('[Build] No output directory found (checked: dist, build, out, .next)');
      publishLog('Error: No build output directory found');
      await cleanup(1);
      return;
    }

    console.log(`[Build] Found output directory: ${path.basename(outputDir)}`);

    try {
      const allFiles = getAllFiles(outputDir);
      console.log(`[Upload] ${allFiles.length} files to upload`);

      for (const filePath of allFiles) {
        const relativePath = path.relative(outputDir, filePath);

        console.log(`[Upload] Uploading: ${relativePath}`);
        publishLog(`Uploading: ${relativePath}`);

        const command = new PutObjectCommand({
          Bucket: S3_BUCKET,
          Key: `__outputs/${PROJECT_ID}/${relativePath}`,
          Body: fs.createReadStream(filePath),
          ContentType: mime.lookup(filePath) || 'application/octet-stream',
        });

        await s3Client.send(command);
      }

      console.log(`[Upload] All ${allFiles.length} files uploaded successfully`);
      publishLog('Deployment complete!');
      await cleanup(0);
    } catch (err) {
      console.error('[Upload] Failed:', err.message);
      publishLog(`Upload failed: ${err.message}`);
      await cleanup(1);
    }
  });
}

async function cleanup(exitCode) {
  try {
    publisher.disconnect();
  } catch (e) {
    // ignore
  }
  process.exit(exitCode);
}

init();
