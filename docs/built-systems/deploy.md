# Deploy pipeline

A push to `main` runs `.github/workflows/deploy.yml`: tests, then one image per service built on GitHub's runners and pushed to GHCR as `sha-<commit>`, then `scripts/deploy.sh` on the server over SSH.

## Rules

- **The server never builds images and never runs `docker compose pull`.** It only runs images CI built. `docker-compose.yml` refers to local `:live` tags that exist in no registry; `deploy.sh` points them at the pulled `sha-<commit>` images. Building on the Mac is for local development only (it is arm64; the server is x86_64).
- **Rollback depends on the `:live` retag.** `deploy.sh` records the image each running container uses before retagging, and restores those if any service is not healthy in time. Do not switch Compose to `sha-<commit>` image names without rewriting the rollback.
- **Every service keeps a Docker `healthcheck`.** `deploy.sh` decides success from container health only. A service without one never becomes healthy, so every deploy would roll back.
- **Health checks must not depend on the database or the LLM.** An outage there would roll back a good release, and a rollback cannot fix it. The database is reported separately (`/health/database`).
- **The GHCR token arrives on stdin.** `deploy.sh` consumes it with a throwaway `DOCKER_CONFIG`, so no credential is stored on the server. Nothing else in the SSH command chain may read stdin.
- **`deploy.sh` needs bash 4+** (associative arrays). macOS's bash 3.2 cannot run it; test it in a `docker:29-cli` container with the Docker socket mounted.
- **Server details are Actions secrets, never committed.** The repo is public: host, port, user, deploy folder and SSH key all live in secrets. The workflow refuses to deploy as `root`.
- **Every service keeps `cpus` and `mem_limit`.** The server is shared with other live apps.
- **Only `web` publishes a port, and only on `127.0.0.1`.** The Python services are reachable only on the Compose network.
