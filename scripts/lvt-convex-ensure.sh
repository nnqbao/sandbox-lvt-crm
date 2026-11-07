#!/bin/zsh
# Keep Colima + LVT Convex self-hosted stack up for production.
# Intended to run under LaunchAgent ai.lvt.crm.convex (KeepAlive loop).
set -euo pipefail
umask 077

readonly REPO="/Users/vsc_agent/projects/LVT-CRM"
readonly COMPOSE_FILE="$REPO/infra/convex-local/docker-compose.yml"
readonly DOCKER_SOCK="/Users/vsc_agent/.colima/default/docker.sock"
readonly HEALTH_URL="http://127.0.0.1:3318/version"
readonly CHECK_INTERVAL_SEC="${LVT_CONVEX_ENSURE_INTERVAL:-20}"
readonly DOCKER_WAIT_SEC=120
readonly HEALTH_WAIT_SEC=90

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export HOME="/Users/vsc_agent"
export DOCKER_HOST="unix://${DOCKER_SOCK}"

if [[ ! "$CHECK_INTERVAL_SEC" =~ ^[0-9]+$ ]] || (( CHECK_INTERVAL_SEC < 1 || CHECK_INTERVAL_SEC > 3600 )); then
  print -u2 -- "LVT_CONVEX_ENSURE_INTERVAL must be an integer from 1 to 3600 seconds"
  exit 64
fi

log() {
  print -r -- "$(date '+%Y-%m-%dT%H:%M:%S%z') $*"
}

backend_healthy() {
  curl -fsS --max-time 5 "$HEALTH_URL" >/dev/null 2>&1
}

docker_ready() {
  docker info >/dev/null 2>&1
}

colima_running() {
  colima status >/dev/null 2>&1
}

wait_docker() {
  local elapsed=0
  while (( elapsed < DOCKER_WAIT_SEC )); do
    if docker_ready; then
      return 0
    fi
    sleep 2
    (( elapsed += 2 ))
  done
  return 1
}

wait_backend() {
  local elapsed=0
  while (( elapsed < HEALTH_WAIT_SEC )); do
    if backend_healthy; then
      return 0
    fi
    sleep 2
    (( elapsed += 2 ))
  done
  return 1
}

ensure_colima() {
  if docker_ready; then
    return 0
  fi

  if colima_running; then
    log "colima reports running but docker is down; restarting colima"
    colima restart || {
      log "colima restart failed; trying stop+start"
      colima stop || true
      colima start
    }
  else
    log "starting colima"
    colima start
  fi

  if ! wait_docker; then
    log "ERROR: docker not ready after colima start/restart"
    return 1
  fi
  log "docker ready"
}

ensure_convex() {
  if backend_healthy; then
    return 0
  fi

  log "convex backend unhealthy; bringing compose up"
  docker compose -f "$COMPOSE_FILE" up -d

  if wait_backend; then
    log "convex backend healthy"
    return 0
  fi

  log "convex still unhealthy; restarting backend service"
  docker compose -f "$COMPOSE_FILE" restart backend || true

  if wait_backend; then
    log "convex backend healthy after restart"
    return 0
  fi

  log "ERROR: convex backend still unhealthy on $HEALTH_URL"
  return 1
}

trap 'log "stopping ensure loop"; exit 0' INT TERM

log "lvt-convex-ensure started interval=${CHECK_INTERVAL_SEC}s"
while true; do
  if ensure_colima; then
    ensure_convex || true
  fi
  sleep "$CHECK_INTERVAL_SEC"
done
