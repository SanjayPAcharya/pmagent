#!/usr/bin/env bash
# Seed the Playwright e2e test user into the running dev Keycloak realm.
#
# The e2e suite (apps/web/e2e) logs in as this user via the real hosted-login
# flow in global-setup, so it must exist in the `agentpm` realm. The committed
# realm import (realm-agentpm.json) intentionally ships no users, so run this
# once against a running stack (`docker compose up`) before `pnpm test:e2e`.
# Idempotent: a 409 (already exists) is treated as success.
set -euo pipefail

KC_URL="${KC_URL:-http://localhost:8080}"
KC_ADMIN="${KC_ADMIN:-admin}"
KC_ADMIN_PASSWORD="${KC_ADMIN_PASSWORD:-admin}"
E2E_USER="${E2E_USER:-e2e-a@example.com}"
E2E_PASS="${E2E_PASS:-password}"

token=$(curl -sf -X POST "$KC_URL/realms/master/protocol/openid-connect/token" \
  -d grant_type=password -d client_id=admin-cli \
  -d "username=$KC_ADMIN" -d "password=$KC_ADMIN_PASSWORD" \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["access_token"])')

status=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$KC_URL/admin/realms/agentpm/users" \
  -H "Authorization: Bearer $token" -H 'Content-Type: application/json' \
  -d "{\"username\":\"$E2E_USER\",\"email\":\"$E2E_USER\",\"emailVerified\":true,\"enabled\":true,\"firstName\":\"E2E\",\"lastName\":\"Tester\",\"credentials\":[{\"type\":\"password\",\"value\":\"$E2E_PASS\",\"temporary\":false}]}")

case "$status" in
  201) echo "seeded e2e user: $E2E_USER" ;;
  409) echo "e2e user already exists: $E2E_USER" ;;
  *)   echo "unexpected status $status seeding $E2E_USER" >&2; exit 1 ;;
esac
