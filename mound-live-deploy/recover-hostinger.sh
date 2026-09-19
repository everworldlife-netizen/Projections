#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

VM_ID=1815910
PROJECT=mound-live
IMAGE=mound-live:2026-09-19-r1
PORT=8866
BRANCH=mound-live-hostinger
REPO=https://github.com/everworldlife-netizen/Projections.git
RAW=https://raw.githubusercontent.com/everworldlife-netizen/Projections/${BRANCH}/mound-live-deploy
ROOT=/opt/mound-live

[[ $EUID -eq 0 ]] || { echo "Run as root."; exit 1; }
command -v docker >/dev/null || { echo "Docker is missing."; exit 1; }
command -v hostinger >/dev/null || { echo "Hostinger CLI is missing."; exit 1; }
command -v curl >/dev/null || { echo "curl is missing."; exit 1; }
command -v python3 >/dev/null || { echo "python3 is missing."; exit 1; }

echo "=== MOUND HOSTINGER RECOVERY DEPLOY ==="
echo "This does not stop or replace micro-edge, Traefik, Hermes, Redis, Postgres, Ollama, or Tailscale."

if [[ -z "${HOSTINGER_API_TOKEN:-}" ]]; then
  read -rsp "Hostinger API token (hidden): " HOSTINGER_API_TOKEN
  echo
  export HOSTINGER_API_TOKEN
fi

echo
echo "--- Hostinger authentication check ---"
hostinger vps virtual-machines list --format json >/tmp/mound-vms.json
python3 - <<'PY'
import json
v=json.load(open('/tmp/mound-vms.json'))
assert any(int(x.get('id',0))==1815910 and x.get('state')=='running' for x in v), "Expected VPS 1815910 is not running"
print("VPS 1815910 authenticated and running.")
PY

echo
echo "--- Prior failed Hostinger action (diagnostic only) ---"
hostinger vps actions get "$VM_ID" 115573052 --format json || true

echo
echo "--- Existing critical containers before deployment ---"
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' | grep -E 'NAMES|micro-edge|traefik|hermes|mound-live' || true

if ss -H -ltn "sport = :$PORT" | grep -q .; then
  owner=$(docker ps --filter name='^/mound-live-app$' --format '{{.Names}}' || true)
  if [[ "$owner" != "mound-live-app" ]]; then
    echo "Port $PORT is occupied by something other than Mound. Refusing to continue."
    ss -ltnp "sport = :$PORT" || true
    exit 1
  fi
fi

echo
echo "--- Preparing private Mound data and secret directories ---"
mkdir -p "$ROOT/data" "$ROOT/secrets"
chmod 750 "$ROOT/data" "$ROOT/secrets"
chown 10001:10001 "$ROOT/data" || true
chown root:10001 "$ROOT/secrets" || true

if [[ ! -s "$ROOT/secrets/app_password" ]]; then
  python3 -c 'import secrets; print(secrets.token_urlsafe(24), end="")' > "$ROOT/secrets/app_password"
fi
for f in app_password typesafe_api_key odds_api_key; do
  [[ -e "$ROOT/secrets/$f" ]] || : > "$ROOT/secrets/$f"
  chmod 640 "$ROOT/secrets/$f"
  chown root:10001 "$ROOT/secrets/$f" || true
done

echo
echo "--- Building exact Mound image locally on this VPS ---"
curl -fsSL "$RAW/Dockerfile" | docker build --pull --progress=plain -t "$IMAGE" -f - "$REPO#$BRANCH"

echo
echo "--- Verifying built image exists ---"
docker image inspect "$IMAGE" --format 'Image={{.RepoTags}} Created={{.Created}}' 

COMPOSE_CONTENT=$(cat <<YAML
name: mound-live
services:
  app:
    image: ${IMAGE}
    pull_policy: never
    container_name: mound-live-app
    restart: unless-stopped
    ports:
      - "127.0.0.1:${PORT}:8000"
    environment:
      DATA_DIR: /app/data
      APP_USER: akara
      APP_PASSWORD_FILE: /run/secrets/app_password
      TYPESAFE_API_KEY_FILE: /run/secrets/typesafe_api_key
      ODDS_API_KEY_FILE: /run/secrets/odds_api_key
      POLL_SECONDS: "5"
      COLLECT: "1"
    volumes:
      - /opt/mound-live/data:/app/data
      - /opt/mound-live/secrets:/run/secrets:ro
    read_only: true
    tmpfs:
      - /tmp:size=64m,mode=1777
    cap_drop:
      - ALL
    security_opt:
      - no-new-privileges:true
    pids_limit: 160
    mem_limit: 1536m
    cpus: 1.5
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
    labels:
      traefik.enable: "false"
YAML
)

echo
echo "--- Creating Mound project through Hostinger CLI ---"
CREATE_JSON=$(hostinger vps docker create "$VM_ID"   --project-name "$PROJECT"   --content "$COMPOSE_CONTENT"   --format json)

printf '%s\n' "$CREATE_JSON"
printf '%s\n' "$CREATE_JSON" >/tmp/mound-create.json
ACTION_ID=$(python3 - <<'PY'
import json
d=json.load(open('/tmp/mound-create.json'))
print(d.get('id',''))
PY
)

echo
echo "Hostinger action ID: ${ACTION_ID:-unknown}"
echo "Waiting for container and health endpoint..."

READY=0
for i in $(seq 1 72); do
  if curl -fsS --max-time 3 "http://127.0.0.1:$PORT/healthz" >/tmp/mound-health.json 2>/dev/null; then
    READY=1
    break
  fi
  sleep 5
done

if [[ "$READY" -ne 1 ]]; then
  echo
  echo "Mound did not become healthy."
  if [[ -n "$ACTION_ID" ]]; then
    echo "--- Hostinger action details ---"
    hostinger vps actions get "$VM_ID" "$ACTION_ID" --format json || true
  fi
  echo "--- Hostinger Docker projects ---"
  hostinger vps docker list "$VM_ID" --format json || true
  echo "--- Hostinger Mound logs ---"
  hostinger vps docker logs "$VM_ID" "$PROJECT" --format json || true
  echo "--- Local Docker state ---"
  docker ps -a --filter name='mound-live-app' --no-trunc || true
  docker logs --tail=100 mound-live-app 2>&1 || true
  exit 1
fi

echo
echo "--- Application health ---"
cat /tmp/mound-health.json
echo

echo
echo "--- Authenticated dashboard API check ---"
MOUND_PASSWORD=$(cat "$ROOT/secrets/app_password")
curl -fsS --max-time 10 -u "akara:$MOUND_PASSWORD" "http://127.0.0.1:$PORT/api/board" >/tmp/mound-board.json
python3 - <<'PY'
import json
d=json.load(open('/tmp/mound-board.json'))
print("Dashboard API returned valid JSON.")
print("Top-level fields:", ", ".join(sorted(d.keys())[:20]))
PY
unset MOUND_PASSWORD

echo
echo "--- MLB connectivity from INSIDE Mound container ---"
docker exec mound-live-app python - <<'PY'
import json, urllib.request, time
u='https://statsapi.mlb.com/api/v1/schedule?sportId=1'
t=time.monotonic()
with urllib.request.urlopen(u, timeout=10) as r:
    body=r.read()
    status=r.status
data=json.loads(body)
print(f"MLB HTTP={status} response_seconds={time.monotonic()-t:.3f} dates={len(data.get('dates',[]))}")
PY

echo
echo "--- Hostinger-managed container status ---"
hostinger vps docker containers "$VM_ID" "$PROJECT" --format json

echo
echo "--- Critical existing containers after deployment ---"
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' | grep -E 'NAMES|micro-edge|traefik|hermes|mound-live' || true

echo
echo "===================================================="
echo "MOUND LIVE IS INSTALLED AND HEALTHY"
echo "===================================================="
echo "Dashboard user: akara"
echo "Dashboard password is stored ONLY at:"
echo "  /opt/mound-live/secrets/app_password"
echo
echo "Private dashboard address on the VPS:"
echo "  http://127.0.0.1:$PORT"
echo
echo "From your Windows PC, open a private tunnel with:"
echo "  ssh -N -L $PORT:127.0.0.1:$PORT root@2.25.134.249"
echo "Then browse to:"
echo "  http://127.0.0.1:$PORT"
echo
echo "To view the dashboard password privately on the VPS:"
echo "  cat /opt/mound-live/secrets/app_password"
echo "===================================================="
