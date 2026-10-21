#!/usr/bin/env bash
#
# Starts the whole UniOLX stack locally: Postgres, the FastAPI backend and the
# React dev server. Ctrl-C stops the API and the frontend again.
#
#   ./dev.sh          start everything
#   ./dev.sh --stop   stop the API and the frontend
#   ./dev.sh --reset  wipe the database, re-run migrations and re-seed
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$ROOT/backend"
VENV="$BACKEND/.venv"
PGBIN="/opt/homebrew/opt/postgresql@17/bin"
API_PORT="${API_PORT:-8000}"
LOG_DIR="$BACKEND/.logs"

BLUE='\033[0;34m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'; RED='\033[0;31m'; NC='\033[0m'

info()  { printf "${BLUE}==>${NC} %s\n" "$1"; }
ok()    { printf "${GREEN} ok${NC} %s\n" "$1"; }
warn()  { printf "${YELLOW}warn${NC} %s\n" "$1"; }
fail()  { printf "${RED}fail${NC} %s\n" "$1"; exit 1; }

stop_servers() {
  info "Stopping the API and the frontend"
  pkill -f "uvicorn app.main:app" 2>/dev/null || true
  pkill -f "vite --port=3000" 2>/dev/null || true
  lsof -ti:"$API_PORT" 2>/dev/null | xargs kill -9 2>/dev/null || true
  ok "Stopped"
}

if [[ "${1:-}" == "--stop" ]]; then
  stop_servers
  exit 0
fi

# ---------------------------------------------------------------- database --
if ! command -v brew >/dev/null 2>&1; then
  fail "Homebrew is required (brew install postgresql@17 pgvector)"
fi

if ! brew list postgresql@17 >/dev/null 2>&1; then
  info "Installing PostgreSQL 17 and pgvector (this takes a few minutes)"
  brew install postgresql@17 pgvector
fi

if ! brew services list | grep -q "postgresql@17.*started"; then
  info "Starting PostgreSQL"
  brew services start postgresql@17
  sleep 3
fi
ok "PostgreSQL is running"

if ! "$PGBIN/psql" -d postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname='uniolx'" | grep -q 1; then
  info "Creating the database role"
  "$PGBIN/psql" -d postgres -c "CREATE ROLE uniolx LOGIN PASSWORD 'uniolx' CREATEDB;"
fi

if ! "$PGBIN/psql" -l | grep -q uniolx; then
  info "Creating the uniolx database"
  "$PGBIN/createdb" -O uniolx uniolx
fi
if ! "$PGBIN/psql" -l | grep -q uniolx_test; then
  "$PGBIN/createdb" -O uniolx uniolx_test
fi

if ! "$PGBIN/psql" -d uniolx -tAc "SELECT 1 FROM pg_extension WHERE extname='vector'" | grep -q 1; then
  info "Enabling the pgvector extension"
  "$PGBIN/psql" -d uniolx -c "CREATE EXTENSION IF NOT EXISTS vector;"
  "$PGBIN/psql" -d uniolx_test -c "CREATE EXTENSION IF NOT EXISTS vector;" || true
fi
ok "Database ready"

# ----------------------------------------------------------------- backend --
if [[ ! -d "$VENV" ]]; then
  info "Creating the Python virtual environment"
  python3 -m venv "$VENV"
  "$VENV/bin/pip" install --quiet --upgrade pip
  "$VENV/bin/pip" install --quiet -r "$BACKEND/requirements.txt"
fi

if [[ ! -f "$BACKEND/.env" ]]; then
  info "Creating backend/.env from the example"
  cp "$BACKEND/.env.example" "$BACKEND/.env"
  warn "backend/.env was created with the default development values. Add a GEMINI_API_KEY to enable AI search."
fi

if [[ "${1:-}" == "--reset" ]]; then
  info "Resetting the database"
  "$VENV/bin/alembic" -c "$BACKEND/alembic.ini" downgrade base 2>/dev/null || true
  "$VENV/bin/alembic" -c "$BACKEND/alembic.ini" upgrade head
  (cd "$BACKEND" && "$VENV/bin/python" scripts/seed.py --reset)
else
  (cd "$BACKEND" && "$VENV/bin/alembic" -c "$BACKEND/alembic.ini" upgrade head)
fi
ok "Schema is up to date"

# ------------------------------------------------------------------- start --
mkdir -p "$LOG_DIR"

if lsof -ti:"$API_PORT" >/dev/null 2>&1; then
  warn "Port $API_PORT is already in use, stopping the old API"
  lsof -ti:"$API_PORT" | xargs kill -9 2>/dev/null || true
  sleep 1
fi

info "Starting the API on port $API_PORT"
(cd "$BACKEND" && nohup "$VENV/bin/uvicorn" app.main:app --port "$API_PORT" --host 127.0.0.1 \
  > "$LOG_DIR/api.log" 2>&1 < /dev/null &)

for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:$API_PORT/health" >/dev/null 2>&1; then break; fi
  sleep 0.5
done
if curl -fsS "http://127.0.0.1:$API_PORT/health" >/dev/null 2>&1; then
  ok "API is up at http://127.0.0.1:$API_PORT  (docs at /docs)"
else
  fail "The API did not start. See $LOG_DIR/api.log"
fi

cd "$ROOT"
if [[ ! -d node_modules ]]; then
  info "Installing the frontend dependencies"
  (bun install || npm install)
fi

info "Starting the frontend"
nohup bun run dev > "$LOG_DIR/web.log" 2>&1 < /dev/null &
sleep 6

WEB_PORT="$(grep -oE 'http://localhost:[0-9]+' "$LOG_DIR/web.log" | tail -1 | grep -oE '[0-9]+' || true)"
if [[ -z "$WEB_PORT" ]]; then
  WEB_PORT=3000
  warn "Could not detect the frontend port, assuming $WEB_PORT"
fi

printf "\n${GREEN}UniOLX is running${NC}\n"
printf "  frontend   http://localhost:%s\n" "$WEB_PORT"
printf "  API        http://127.0.0.1:%s\n" "$API_PORT"
printf "  API docs   http://127.0.0.1:%s/docs\n" "$API_PORT"
printf "  logs       %s\n" "$LOG_DIR"
printf "\n  demo login aarav.sharma.cs22@rvce.edu.in / password123\n"
printf "  dev OTP    123456 (development only)\n"
printf "\n  stop with  ./dev.sh --stop\n\n"
