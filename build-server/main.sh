#!/bin/bash
set -euo pipefail

echo "[Clone] Starting repository clone..."

if [ -z "${GIT_REPOSITORY__URL:-}" ]; then
  echo "[Clone] Error: GIT_REPOSITORY__URL is not set"
  exit 1
fi

if [ -z "${PROJECT_ID:-}" ]; then
  echo "[Clone] Error: PROJECT_ID is not set"
  exit 1
fi

echo "[Clone] Cloning: $GIT_REPOSITORY__URL"
git clone --depth 1 "$GIT_REPOSITORY__URL" /home/app/output

if [ $? -ne 0 ]; then
  echo "[Clone] Error: Failed to clone repository"
  exit 1
fi

echo "[Clone] Clone successful. Starting build..."
exec node script.js
