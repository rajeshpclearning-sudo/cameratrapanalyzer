#!/usr/bin/env bash
# Deploy WildEye Analyzer to Railway (run after: railway login)
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v railway >/dev/null 2>&1; then
  echo "Install Railway CLI: brew install railway"
  exit 1
fi

railway whoami || { echo "Run: railway login"; exit 1; }

if [[ ! -f .railway/project.json ]]; then
  echo "Linking project (choose Create new project if prompted)..."
  railway init --name wildeye-analyzer
fi

echo "Setting OPENAI_API_KEY from .env.local if present..."
if [[ -f .env.local ]]; then
  # shellcheck disable=SC2046
  export $(grep -v '^#' .env.local | grep OPENAI_API_KEY | xargs)
  if [[ -n "${OPENAI_API_KEY:-}" ]]; then
    railway variables set "OPENAI_API_KEY=${OPENAI_API_KEY}"
  fi
fi

echo "Deploying..."
railway up --detach

echo "Generate public URL in Railway dashboard: Settings → Networking → Generate Domain"
echo "Or run: railway domain"
