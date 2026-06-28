#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

export NODE_ENV=production
export PORT="${PORT:-3138}"
export TSL_APP_ROOT="$ROOT_DIR"
export PATH="$HOME/.local/opt/node-v22/bin:$PATH"

printf '%s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ") git-deploy static-assets-v1 api-proxy-v1" > .deploy-marker

NPM_CONFIG_PRODUCTION=false npm install --include=dev
npm run prisma:generate
npm run prisma:push
npm run build:cloudways

if command -v pm2 >/dev/null 2>&1; then
  pm2 startOrRestart ecosystem.config.cjs --only policyforge-lab --update-env
  pm2 save || true
else
  echo "pm2 was not found in PATH. Start/restart the Node process from Cloudways or install pm2 for this SSH user."
fi

echo "Local build-info:"
curl -fsS "http://127.0.0.1:${PORT}/api/build-info" || true
