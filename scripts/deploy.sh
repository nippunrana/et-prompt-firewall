#!/usr/bin/env bash
# Usage: scripts/deploy.sh <commit-sha> [<registry-user>]
#
# Runs on the VPS. The GitHub Actions deploy job resets the checkout to <commit-sha>, then calls
# this with the job's short-lived GHCR token on stdin and the GitHub user it belongs to. It pulls
# the three images CI built for that commit, points each service's :live tag at them and restarts.
# If any service is not healthy in time, the previous images are put back and the script exits 1,
# so the CI run goes red while the last working version stays live. The server never builds images.
#
# Manual rollback (the newest 3 images per service stay on disk, so no token is needed):
#   git reset --hard <older-sha> && scripts/deploy.sh <older-sha>
set -euo pipefail

REGISTRY="ghcr.io/nippunrana/et-prompt-firewall"
SERVICES=(firewall demo-agent web)
# The image each service was running before this deploy, for rollback. Empty on the first deploy.
declare -A PREVIOUS=()

cd "$(dirname "$0")/.."

image_for() { echo "$REGISTRY-$1:sha-$2"; }
live_tag() { echo "et-prompt-firewall-$1:live"; }

# Logs in with a throwaway Docker config, so the token never touches ~/.docker/config.json
# and cannot interfere with other apps' registry logins on this server. Runs in a subshell so
# the cleanup trap is its own.
pull_images() (
  sha="$1" missing=()
  for svc in "${SERVICES[@]}"; do
    docker image inspect "$(image_for "$svc" "$sha")" >/dev/null 2>&1 || missing+=("$(image_for "$svc" "$sha")")
  done
  [ "${#missing[@]}" -eq 0 ] && exit 0

  config=$(mktemp -d)
  trap 'rm -rf "$config"' EXIT
  DOCKER_CONFIG="$config" docker login ghcr.io -u "${2:?a registry user is needed to pull missing images}" --password-stdin >/dev/null
  for image in "${missing[@]}"; do
    DOCKER_CONFIG="$config" docker pull --quiet "$image"
  done
)

wait_healthy() {
  local attempt svc id status all_healthy
  for attempt in $(seq 1 45); do
    all_healthy=1
    for svc in "${SERVICES[@]}"; do
      id=$(docker compose ps -q "$svc")
      status=$(docker inspect --format '{{.State.Health.Status}}' "$id" 2>/dev/null || echo "missing")
      [ "$status" = "healthy" ] || all_healthy=0
    done
    [ "$all_healthy" -eq 1 ] && return 0
    echo "  waiting for all services to be healthy ($attempt/45)"
    sleep 2
  done
  return 1
}

rollback() {
  local svc
  docker compose logs --tail 50 >&2 || true
  for svc in "${SERVICES[@]}"; do
    if [ -z "${PREVIOUS[$svc]}" ]; then
      echo "ERROR: the new version failed and there is no previous $svc image to roll back to" >&2
      exit 1
    fi
  done
  echo "ERROR: the new version failed; rolling back to the previous images" >&2
  for svc in "${SERVICES[@]}"; do
    docker tag "${PREVIOUS[$svc]}" "$(live_tag "$svc")"
  done
  docker compose up -d --no-build --remove-orphans
  if wait_healthy; then
    echo "==> Rollback complete: the previous version is live. Fix the error above and push again." >&2
  else
    echo "ERROR: the previous version is not healthy either; the site may be down" >&2
  fi
  exit 1
}

main() {
  local sha="${1:?usage: scripts/deploy.sh <commit-sha> [<registry-user>]}" registry_user="${2:-}"
  echo "==> Deploying $sha ($(date -u '+%Y-%m-%d %H:%M:%S UTC'))"

  # Fails here, before anything changes, if .env is missing a required value
  docker compose config --quiet

  echo "==> 1. Pulling images"
  pull_images "$sha" "$registry_user"

  local svc id
  for svc in "${SERVICES[@]}"; do
    id=$(docker compose ps -q "$svc")
    PREVIOUS[$svc]=$([ -n "$id" ] && docker inspect --format '{{.Image}}' "$id" || true)
  done

  echo "==> 2. Starting the new version"
  for svc in "${SERVICES[@]}"; do
    docker tag "$(image_for "$svc" "$sha")" "$(live_tag "$svc")"
  done
  docker compose up -d --no-build --remove-orphans || rollback

  echo "==> 3. Waiting for health checks"
  wait_healthy || rollback

  echo "==> 4. Removing this project's old images (keeping the newest 3 per service)"
  for svc in "${SERVICES[@]}"; do
    docker images "$REGISTRY-$svc" --format '{{.Repository}}:{{.Tag}}' | tail -n +4 | xargs -r docker rmi >/dev/null 2>&1 || true
  done

  echo "==> Deployed $sha"
}

main "$@"
