#!/usr/bin/env bash
# Push OpenRouter / OpenAI env from .env.local to Railway (run after: railway login && railway link)
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v railway >/dev/null 2>&1; then
  echo "Install Railway CLI: brew install railway"
  exit 1
fi

railway whoami || { echo "Run: railway login"; exit 1; }

if [[ ! -f .env.local ]]; then
  echo "Missing .env.local — copy from .env.example and add your keys."
  exit 1
fi

# Load .env.local (no comments, no export of unrelated vars)
set -a
# shellcheck disable=SC1091
source <(grep -v '^#' .env.local | grep -v '^[[:space:]]*$' | sed 's/^/export /')
set +a

if [[ -z "${OPENAI_API_KEY:-}" ]]; then
  echo "OPENAI_API_KEY is empty in .env.local"
  exit 1
fi

# OpenRouter recommends a public site URL (use Railway domain, not localhost)
RAILWAY_SITE="${OPENROUTER_SITE_URL:-}"
if [[ -z "$RAILWAY_SITE" || "$RAILWAY_SITE" == *localhost* ]]; then
  DOMAIN=$(railway domain 2>/dev/null | head -1 || true)
  if [[ -n "$DOMAIN" ]]; then
    RAILWAY_SITE="https://${DOMAIN#https://}"
  else
    RAILWAY_SITE="https://cameratrapanalyzer-production.up.railway.app"
    echo "Using default site URL: $RAILWAY_SITE (override with OPENROUTER_SITE_URL in .env.local)"
  fi
fi

BASE_URL="${OPENAI_BASE_URL:-https://openrouter.ai/api/v1}"
MODEL="${LLM_MODEL:-openai/gpt-4o-mini}"

echo "Setting Railway variables for linked service..."
railway variables set \
  "OPENAI_API_KEY=${OPENAI_API_KEY}" \
  "OPENAI_BASE_URL=${BASE_URL}" \
  "LLM_MODEL=${MODEL}" \
  "OPENROUTER_SITE_URL=${RAILWAY_SITE}"

echo "Done. Redeploy if the service is already running:"
echo "  railway redeploy"
