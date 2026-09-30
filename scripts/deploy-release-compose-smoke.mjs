#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const deployScript = path.join(root, "scripts", "deploy-release.sh");
const bash = process.env.BASH_PATH ||
  (process.platform === "win32" ? "D:\\DEV\\Git\\bin\\bash.exe" : "bash");
const commit = "0123456789abcdef0123456789abcdef01234567";
const temp = mkdtempSync(path.join(root, "output", "deploy-compose-smoke-"));
const composePath = path.join(temp, "docker-compose.yml");

const legacyCompose = `services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: naumi
    volumes:
      - legacy-pgdata:/var/lib/postgresql/data

  app:
    image: ghcr.io/jesstle/naumi:legacy-release
    restart: unless-stopped
    ports:
      - "127.0.0.1:4312:3000"
    environment:
      DATABASE_URL: postgres://legacy-user:legacy-pass@db:5432/legacy
      SETTINGS_SECRET: keep-existing-secret
      VIDEO_API_BASE_URL: \${VIDEO_API_BASE_URL:-}
      VIDEO_API_KEY: \${VIDEO_API_KEY:-}
      VIDEO_API_MODEL: \${VIDEO_API_MODEL:-legacy-video}
    volumes:
      - legacy-appdata:/data
    depends_on:
      - db

volumes:
  legacy-pgdata:
  legacy-appdata:
`;

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
}

try {
  writeFileSync(composePath, legacyCompose, "utf8");
  const first = run(bash, [deployScript, "--upgrade-compose", composePath, commit]);
  assert.match(first, /COMPOSE_UPGRADE_RESULT=PASS/);

  const once = readFileSync(composePath, "utf8");
  assert.match(once, /127\.0\.0\.1:4312:3000/);
  assert.match(once, /legacy-appdata:\/data/);
  assert.match(once, /SETTINGS_SECRET: keep-existing-secret/);
  assert.equal((once.match(/^      NAUMI_VIDEO_WORKER:/gm) || []).length, 1);
  assert.equal((once.match(/^      VIDEO_WORKER_SECRET:/gm) || []).length, 2);
  assert.equal((once.match(/^      VIDEO_API_MODELS:/gm) || []).length, 1);
  assert.equal((once.match(/^      VIDEO_PROVIDERS_JSON:/gm) || []).length, 1);
  assert.equal((once.match(/^  video-worker:/gm) || []).length, 1);
  assert.equal(
    (once.match(new RegExp(`image: ghcr\\.io/jesstle/naumi:${commit}`, "g")) || []).length,
    2
  );

  const rendered = JSON.parse(
    run("docker", ["compose", "-f", composePath, "config", "--format", "json"])
  );
  assert.deepEqual(Object.keys(rendered.services).sort(), ["app", "db", "video-worker"]);
  assert.equal(rendered.services.app.environment.NAUMI_VIDEO_WORKER, "0");
  assert.equal(rendered.services.app.environment.SETTINGS_SECRET, "keep-existing-secret");
  assert.equal(rendered.services.app.image, `ghcr.io/jesstle/naumi:${commit}`);
  assert.equal(rendered.services["video-worker"].image, `ghcr.io/jesstle/naumi:${commit}`);
  assert.equal(rendered.services["video-worker"].command.join(" "), "node scripts/video-worker.mjs");
  assert.equal(rendered.services["video-worker"].environment.NAUMI_APP_ORIGIN, "http://app:3000");
  assert.ok(rendered.services.app.volumes.some((volume) => volume.target === "/data"));

  const second = run(bash, [deployScript, "--upgrade-compose", composePath, commit]);
  assert.match(second, /COMPOSE_UPGRADE_RESULT=PASS/);
  assert.equal(readFileSync(composePath, "utf8"), once, "compose upgrade must be idempotent");

  const deploySource = readFileSync(deployScript, "utf8");
  assert.match(deploySource, /up -d --no-deps --no-build app video-worker/);
  assert.match(deploySource, /stop -t 30 video-worker/);
  assert.match(deploySource, /rm -f -s video-worker/);
  assert.match(deploySource, /WORKER_RUNNING=/);
  assert.match(deploySource, /VIDEO_WORKER=PASS STATE=running/);
  assert.match(deploySource, /\/canvas \/video/);
  assert.match(deploySource, /openssl rand -hex 32/);
  assert.match(deploySource, /VIDEO_WORKER_SECRET_STATUS=generated/);
  assert.doesNotMatch(deploySource, /echo .*VIDEO_WORKER_SECRET_VALUE/);

  console.log(
    "PASS deploy release compose: legacy overrides=preserved app video env=complete worker=present forward=app+worker rollback=legacy-safe idempotent=yes"
  );
} finally {
  rmSync(temp, { recursive: true, force: true });
}
