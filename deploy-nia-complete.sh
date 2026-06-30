#!/usr/bin/env bash
set -e
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
log()  { echo -e "${CYAN}▸ $1${NC}"; }
ok()   { echo -e "${GREEN}✓ $1${NC}"; }
warn() { echo -e "${YELLOW}⚠ $1${NC}"; }
die()  { echo -e "${RED}✗ $1${NC}"; exit 1; }

echo -e "\n${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}  NIAKOFA — Deploying Nia to the world${NC}"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"

[[ -f "package.json" ]] || die "Run from ~/Desktop/niakofa-inspect"
command -v railway &>/dev/null || die "Railway CLI not found: curl -fsSL https://railway.com/install.sh | sh"
ok "Preflight passed"

echo -e "\n${BOLD}STEP 1 — Railway Variables${NC}"
EXISTING_KEY=$(railway variables 2>/dev/null | grep ANTHROPIC_API_KEY | awk '{print $NF}' || true)
if [[ -z "$EXISTING_KEY" || "$EXISTING_KEY" == *"YOUR_KEY"* || ${#EXISTING_KEY} -lt 20 ]]; then
  warn "ANTHROPIC_API_KEY missing"
  echo -e "${YELLOW}Get yours at: https://console.anthropic.com/api-keys${NC}"
  echo -n "Paste your Anthropic API key (sk-ant-...): "
  read -r ANTHROPIC_KEY
  [[ "$ANTHROPIC_KEY" == sk-ant-* ]] || die "Invalid key format"
  railway variables set ANTHROPIC_API_KEY="$ANTHROPIC_KEY"
  ok "ANTHROPIC_API_KEY set"
else
  ok "ANTHROPIC_API_KEY already set"
fi

railway variables set INTERNAL_SECRET="$(openssl rand -hex 32)"
railway variables set SESSION_SECRET="$(openssl rand -hex 32)"
ok "Secrets rotated"

NIA_URL=$(railway variables 2>/dev/null | grep NIA_SERVICE_URL | awk '{print $NF}' || true)
if [[ -z "$NIA_URL" ]]; then
  echo -n "Enter nia-service Railway URL (or Enter to skip): "
  read -r NIA_URL_INPUT
  if [[ -n "$NIA_URL_INPUT" ]]; then
    railway variables set NIA_SERVICE_URL="$NIA_URL_INPUT"
    railway variables set VITE_NIA_SERVICE_URL="$NIA_URL_INPUT"
    ok "NIA_SERVICE_URL set"
  else
    warn "Skipped — monorepo assumed"
  fi
else
  ok "NIA_SERVICE_URL: $NIA_URL"
fi

echo -e "\n${BOLD}STEP 2 — Database Migration${NC}"
DB_URL=$(railway variables 2>/dev/null | grep -m1 DATABASE_URL | awk '{print $NF}' || true)
if [[ -n "$DB_URL" ]] && command -v psql &>/dev/null; then
  psql "$DB_URL" << 'SQLEOF'
CREATE INDEX IF NOT EXISTS idx_nia_messages_created_at ON nia_messages (session_id, created_at DESC);
CREATE TABLE IF NOT EXISTS nia_memory_versions (id SERIAL PRIMARY KEY, session_id TEXT NOT NULL, version INT NOT NULL DEFAULT 1, memory_json JSONB NOT NULL, archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE INDEX IF NOT EXISTS idx_nia_memory_versions_session ON nia_memory_versions (session_id, version DESC);
CREATE TABLE IF NOT EXISTS nia_feedback (id SERIAL PRIMARY KEY, session_id TEXT NOT NULL, message_id TEXT NOT NULL, rating SMALLINT NOT NULL CHECK (rating IN (-1, 1)), comment TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE INDEX IF NOT EXISTS idx_nia_feedback_session ON nia_feedback (session_id, created_at DESC);
ALTER TABLE nia_checkins ADD COLUMN IF NOT EXISTS retry_count INT NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS last_retry_at TIMESTAMPTZ, ADD COLUMN IF NOT EXISTS retry_reason TEXT;
SQLEOF
  ok "Migration complete"
else
  warn "psql not available — run migration manually in Railway database console"
  warn "SQL saved to /tmp/nia_migration.sql"
  cat > /tmp/nia_migration.sql << 'SQLEOF'
CREATE INDEX IF NOT EXISTS idx_nia_messages_created_at ON nia_messages (session_id, created_at DESC);
CREATE TABLE IF NOT EXISTS nia_memory_versions (id SERIAL PRIMARY KEY, session_id TEXT NOT NULL, version INT NOT NULL DEFAULT 1, memory_json JSONB NOT NULL, archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS nia_feedback (id SERIAL PRIMARY KEY, session_id TEXT NOT NULL, message_id TEXT NOT NULL, rating SMALLINT NOT NULL CHECK (rating IN (-1, 1)), comment TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
ALTER TABLE nia_checkins ADD COLUMN IF NOT EXISTS retry_count INT NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS last_retry_at TIMESTAMPTZ, ADD COLUMN IF NOT EXISTS retry_reason TEXT;
SQLEOF
fi

echo -e "\n${BOLD}STEP 3 — Deploy${NC}"
log "Running railway up..."
railway up && ok "Deployed!" || warn "Check: railway logs --tail"

echo -e "\n${GREEN}${BOLD}Sawubona, Nia. 🌍 Done.${NC}"
echo "Tail logs: railway logs --tail"
echo "Test Nia:  curl -X POST \$NIA_SERVICE_URL/chat -H 'Content-Type: application/json' -d '{\"message\":\"Sawubona\",\"sessionId\":\"test-001\"}'"
