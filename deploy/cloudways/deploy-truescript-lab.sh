#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

TSL_HOST="${TSL_HOST:-209.97.157.182}"
TSL_USER="${TSL_USER:-master_pkkuxkkjsa}"
TSL_REMOTE_DIR="${TSL_REMOTE_DIR:-/home/master/applications/tmjsnghjkc/public_html}"
TSL_PM2_APP="${TSL_PM2_APP:-policyforge-lab}"
TSL_PORT="${TSL_PORT:-3138}"
TSL_PUBLIC_URL="${TSL_PUBLIC_URL:-https://phpstack-1305612-6519184.cloudwaysapps.com}"
TSL_DATABASE_URL="${TSL_DATABASE_URL:-mysql://tmjsnghjkc:Ym7UJ5pFm2@localhost:3306/tmjsnghjkc}"

cd "$ROOT_DIR"

if ! command -v sshpass >/dev/null 2>&1; then
  echo "sshpass is required for password-based Cloudways deploys."
  echo "Install it or configure SSH keys for ${TSL_USER}@${TSL_HOST}."
  exit 1
fi

if [[ -z "${TSL_SSH_PASSWORD:-}" ]]; then
  read -rsp "Cloudways SSH password for ${TSL_USER}@${TSL_HOST}: " TSL_SSH_PASSWORD
  echo
fi
export SSHPASS="$TSL_SSH_PASSWORD"

SSH_OPTS=(-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null)
REMOTE="${TSL_USER}@${TSL_HOST}"

echo "Checking server write permissions for ${REMOTE}:${TSL_REMOTE_DIR}..."
if ! sshpass -e ssh "${SSH_OPTS[@]}" "$REMOTE" "TSL_REMOTE_DIR='$TSL_REMOTE_DIR' bash -s" <<'REMOTE_PERMISSION_CHECK'
set -euo pipefail

cd "$TSL_REMOTE_DIR"
echo "Remote identity:"
id
echo "Remote target permissions:"
ls -ld . .next .next/static _next _next/static api deploy deploy/cloudways 2>/dev/null || true

touch .codex-root-write-test
rm -f .codex-root-write-test

mkdir -p .next
touch .next/.codex-next-write-test
rm -f .next/.codex-next-write-test

mkdir -p api
touch api/.codex-api-write-test
rm -f api/.codex-api-write-test

mkdir -p _next/static
touch _next/static/.codex-static-write-test
rm -f _next/static/.codex-static-write-test
REMOTE_PERMISSION_CHECK
then
  echo
  echo "Deploy stopped before build: ${TSL_USER} cannot write to ${TSL_REMOTE_DIR}."
  echo "Use the original owning Cloudways SSH user, or ask Cloudways to transfer ownership/write access for this app directory."
  echo "Expected fix on the server side: ${TSL_REMOTE_DIR} and its existing contents must be writable by ${TSL_USER}."
  exit 13
fi

DEPLOY_MARKER="$(date -u +"%Y-%m-%dT%H:%M:%SZ") description-format-v3 api-proxy-v1 static-assets-v1 article-images-wordpress-v1 content-modes-v1 systems-upgrade-v1 idea-used-action-v1 idea-reactivate-action-v1 production-status-flow-v1 script-output-copy-v1 suno-music-prompt-v1"
printf '%s\n' "$DEPLOY_MARKER" > "$ROOT_DIR/.deploy-marker"

echo "Building PolicyForge LAB locally..."
npm run lint
npm run build
npm run typecheck

STATIC_ASSET_PATH="$(cd "$ROOT_DIR" && find .next/static -type f \( -name '*.css' -o -name 'main-app-*.js' -o -name 'webpack-*.js' \) | sort | head -n 1)"
STATIC_ASSET_URL_PATH="/_next/static/${STATIC_ASSET_PATH#.next/static/}"

echo "Syncing app to ${REMOTE}:${TSL_REMOTE_DIR}..."
sshpass -e rsync -rlz --delete \
  -e "ssh ${SSH_OPTS[*]}" \
  --omit-dir-times \
  --no-perms \
  --no-owner \
  --no-group \
  --exclude ".env" \
  --exclude ".git" \
  --exclude ".npm-cache" \
  --include ".next/standalone/node_modules/***" \
  --exclude "node_modules" \
  --exclude "tsconfig.tsbuildinfo" \
  "$ROOT_DIR/" "${REMOTE}:${TSL_REMOTE_DIR}/"

echo "Installing Cloudways PHP proxy files at the web root..."
sshpass -e rsync -rlz \
  -e "ssh ${SSH_OPTS[*]}" \
  --omit-dir-times \
  --no-perms \
  --no-owner \
  --no-group \
  "$ROOT_DIR/deploy/cloudways/index.php" \
  "$ROOT_DIR/deploy/cloudways/.htaccess" \
  "$ROOT_DIR/deploy/cloudways/tsl-deploy-check.txt" \
  "${REMOTE}:${TSL_REMOTE_DIR}/"

sshpass -e rsync -rlz \
  -e "ssh ${SSH_OPTS[*]}" \
  --omit-dir-times \
  --no-perms \
  --no-owner \
  --no-group \
  "$ROOT_DIR/deploy/cloudways/api/" \
  "${REMOTE}:${TSL_REMOTE_DIR}/api/"

echo "Publishing Next static browser assets to ${REMOTE}:${TSL_REMOTE_DIR}/_next/static..."
sshpass -e ssh "${SSH_OPTS[@]}" "$REMOTE" "mkdir -p '$TSL_REMOTE_DIR/_next/static'"
sshpass -e rsync -rlz --delete \
  -e "ssh ${SSH_OPTS[*]}" \
  --omit-dir-times \
  --no-perms \
  --no-owner \
  --no-group \
  "$ROOT_DIR/.next/static/" \
  "${REMOTE}:${TSL_REMOTE_DIR}/_next/static/"

echo "Installing PolicyForge LAB environment and database schema..."
POLICYFORGE_SECRET="${TSL_NEXTAUTH_SECRET:-$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")}"
POLICYFORGE_ENCRYPTION_KEY="${TSL_ENCRYPTION_KEY:-$(node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))")}"
sshpass -e ssh "${SSH_OPTS[@]}" "$REMOTE" \
  "TSL_REMOTE_DIR='$TSL_REMOTE_DIR' TSL_DATABASE_URL='$TSL_DATABASE_URL' TSL_PUBLIC_URL='$TSL_PUBLIC_URL' POLICYFORGE_SECRET='$POLICYFORGE_SECRET' POLICYFORGE_ENCRYPTION_KEY='$POLICYFORGE_ENCRYPTION_KEY' bash -s" <<'REMOTE_ENV'
set -euo pipefail
cd "$TSL_REMOTE_DIR"
if [ ! -f .env ]; then
  cat > .env <<ENV
DATABASE_URL="$TSL_DATABASE_URL"
NEXTAUTH_SECRET="$POLICYFORGE_SECRET"
AUTH_SECRET="$POLICYFORGE_SECRET"
ENCRYPTION_KEY="$POLICYFORGE_ENCRYPTION_KEY"
NEXT_PUBLIC_APP_URL="$TSL_PUBLIC_URL"
ENV
else
  grep -q '^DATABASE_URL=' .env || printf '\nDATABASE_URL="%s"\n' "$TSL_DATABASE_URL" >> .env
  grep -q '^NEXTAUTH_SECRET=' .env || printf 'NEXTAUTH_SECRET="%s"\n' "$POLICYFORGE_SECRET" >> .env
  grep -q '^AUTH_SECRET=' .env || printf 'AUTH_SECRET="%s"\n' "$POLICYFORGE_SECRET" >> .env
  grep -q '^ENCRYPTION_KEY=' .env || printf 'ENCRYPTION_KEY="%s"\n' "$POLICYFORGE_ENCRYPTION_KEY" >> .env
  grep -q '^NEXT_PUBLIC_APP_URL=' .env || printf 'NEXT_PUBLIC_APP_URL="%s"\n' "$TSL_PUBLIC_URL" >> .env
fi
export DATABASE_URL="$TSL_DATABASE_URL"
export PATH="$HOME/.local/opt/node-v22/bin:$HOME/.local/bin:$HOME/bin:$HOME/.npm-global/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
if [ ! -x node_modules/.bin/prisma ]; then
  npm ci
fi
npx prisma db push --accept-data-loss
REMOTE_ENV

echo "Restarting the PM2 process serving port ${TSL_PORT} on Cloudways..."
sshpass -e ssh "${SSH_OPTS[@]}" "$REMOTE" "TSL_REMOTE_DIR='$TSL_REMOTE_DIR' TSL_PM2_APP='$TSL_PM2_APP' TSL_PORT='$TSL_PORT' bash -s" <<'REMOTE_PM2'
set -euo pipefail

cd "$TSL_REMOTE_DIR"

resolve_pm2() {
  export PATH="$HOME/.local/opt/node-v22/bin:$HOME/.local/bin:$HOME/bin:$HOME/.npm-global/bin:$HOME/.config/yarn/global/node_modules/.bin:/usr/local/bin:/usr/bin:/bin:$PATH"

  set +u
  for profile in "$HOME/.bashrc" "$HOME/.bash_profile" "$HOME/.profile"; do
    if [ -f "$profile" ]; then
      # shellcheck disable=SC1090
      . "$profile" >/dev/null 2>&1 || true
    fi
  done
  if [ -s "$HOME/.nvm/nvm.sh" ]; then
    # shellcheck disable=SC1091
    . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1 || true
    nvm use default >/dev/null 2>&1 || true
  fi
  set -u

  if command -v pm2 >/dev/null 2>&1; then
    command -v pm2
    return 0
  fi

  find "$HOME" -type f -name pm2 -path "*/bin/pm2" 2>/dev/null | head -n 1
}

PM2_BIN="$(resolve_pm2 || true)"
if [ -z "$PM2_BIN" ]; then
  echo "Could not find pm2 in the non-interactive Cloudways shell."
  echo "Try this manually on the server to locate it:"
  echo "  source ~/.bashrc 2>/dev/null || true; source ~/.profile 2>/dev/null || true; command -v pm2; find \$HOME -type f -name pm2 -path '*/bin/pm2' 2>/dev/null | head"
  exit 127
fi

echo "Using PM2: $PM2_BIN"

PM2_BIN="$PM2_BIN" TSL_PM2_APP="$TSL_PM2_APP" TSL_PORT="$TSL_PORT" node - <<'NODE'
const { execFileSync } = require('node:child_process');
const cwd = process.cwd();
const pm2 = process.env.PM2_BIN;
const appName = process.env.TSL_PM2_APP || 'policyforge-lab';
const port = process.env.TSL_PORT || '3138';
let list = [];
try {
  list = JSON.parse(execFileSync(pm2, ['jlist'], { encoding: 'utf8' }));
} catch {
  list = [];
}
const ids = list
  .filter((proc) => {
    const env = proc.pm2_env || {};
    return proc.name === appName || env.pm_cwd === cwd || env.cwd === cwd || String(env.PORT || '') === port;
  })
  .map((proc) => String(proc.pm_id));
for (const id of ids) {
  try {
    execFileSync(pm2, ['delete', id], { stdio: 'inherit' });
  } catch {}
}
NODE
TSL_PM2_APP="$TSL_PM2_APP" TSL_PORT="$TSL_PORT" "$PM2_BIN" start ecosystem.config.cjs --only "$TSL_PM2_APP" --update-env
"$PM2_BIN" save
"$PM2_BIN" list

echo "Web root proxy files:"
ls -la index.php .htaccess tsl-deploy-check.txt api/index.php api/.htaccess
echo "Web root Next static files:"
ls -la _next _next/static _next/static/css 2>/dev/null || true

echo "Server-local build-info:"
curl -fsS "http://127.0.0.1:${TSL_PORT}/api/build-info" || true
REMOTE_PM2

PUBLIC_BASE="${TSL_PUBLIC_URL%/}"

echo "Live web-root marker:"
if ! curl -kfsS "${PUBLIC_BASE}/tsl-deploy-check.txt"; then
  echo
  echo "Could not read the static web-root marker over ${PUBLIC_BASE}."
  echo "If this is 404, the public domain is not reaching ${TSL_REMOTE_DIR}."
fi
echo

echo "Live Next static asset:"
if ! curl -kfsSI "${PUBLIC_BASE}${STATIC_ASSET_URL_PATH}"; then
  echo
  echo "Could not verify ${PUBLIC_BASE}${STATIC_ASSET_URL_PATH}."
  echo "If this fails, the browser will show unstyled raw HTML because CSS/JS is not reachable."
fi
echo

echo "Live app API build-info:"
if ! curl -kfsS "${PUBLIC_BASE}/index.php/api/build-info"; then
  echo
  echo "Could not verify the PHP proxy API path over ${PUBLIC_BASE}."
  echo "If the marker works but this fails, PHP is not proxying to the Node app."
fi
echo

echo "Optional clean API build-info:"
if ! curl -kfsS "${PUBLIC_BASE}/api/build-info"; then
  echo
  echo "Clean /api routing is not available on this Cloudways/nginx layer."
  echo "That is OK when Live app API build-info works; the browser app uses /index.php/api instead."
fi
echo

echo "Deploy complete."
