#!/usr/bin/env bash
# Phase 3 — production Keycloak bootstrap (one-shot, runs after realm import).
# The committed realm imports with localhost URLs (dev), so on prod we: point the
# SPA client at the prod domain, wire social IdPs from env, and disable the
# first-broker "Review Profile" step (seamless social signup). Idempotent.
set -uo pipefail
kc=/opt/keycloak/bin/kcadm.sh

until $kc config credentials --server http://localhost:8080 --realm master \
      --user "$KC_ADMIN" --password "$KC_ADMIN_PASSWORD" >/dev/null 2>&1; do
  echo "prod-bootstrap: waiting for keycloak…"; sleep 3
done

# 1. Point the agentpm-web client at the prod domain. URL fields go via -s; the
#    dotted attribute keys (post.logout.redirect.uris, pkce…) break kcadm's -s
#    dotted-key parsing, so set the attributes map by merging a JSON rep (-f -).
cid=$($kc get clients -r agentpm -q clientId=agentpm-web --fields id --format csv 2>/dev/null | tr -d '"\r')
if [ -n "$cid" ]; then
  $kc update "clients/$cid" -r agentpm \
    -s "rootUrl=$PUBLIC_APP_URL" \
    -s "baseUrl=$PUBLIC_APP_URL/" \
    -s "redirectUris=[\"$PUBLIC_APP_URL/*\"]" \
    -s "webOrigins=[\"$PUBLIC_APP_URL\"]" \
    && echo "prod-bootstrap: agentpm-web client URLs -> $PUBLIC_APP_URL"
  printf '{"attributes":{"post.logout.redirect.uris":"%s/*","pkce.code.challenge.method":"S256"}}' "$PUBLIC_APP_URL" \
    | $kc update "clients/$cid" -r agentpm -f - \
    && echo "prod-bootstrap: post-logout + pkce attributes set"
fi

# 2. Social identity providers (create/update from env; skip any without creds).
upsert_idp() {
  al="$1"; pid="$2"; cli="$3"; sec="$4"
  if [ -z "$cli" ]; then echo "prod-bootstrap: idp $al skipped (no client id)"; return; fi
  if $kc get "identity-provider/instances/$al" -r agentpm >/dev/null 2>&1; then
    op=update; tgt="identity-provider/instances/$al"
  else
    op=create; tgt="identity-provider/instances"
  fi
  $kc $op "$tgt" -r agentpm -s alias="$al" -s providerId="$pid" \
    -s enabled=true -s trustEmail=true -s storeToken=false \
    -s "config.clientId=$cli" -s "config.clientSecret=$sec" -s "config.useJwksUrl=true" \
    && echo "prod-bootstrap: idp $al $op"
}
upsert_idp google    google    "${GOOGLE_CLIENT_ID:-}"    "${GOOGLE_CLIENT_SECRET:-}"
upsert_idp microsoft microsoft "${MICROSOFT_CLIENT_ID:-}" "${MICROSOFT_CLIENT_SECRET:-}"
upsert_idp github    github    "${GITHUB_CLIENT_ID:-}"    "${GITHUB_CLIENT_SECRET:-}"

# 3. Seamless first social login: disable the "Review Profile" step.
rp=$($kc get "authentication/flows/first%20broker%20login/executions" -r agentpm \
      --fields id,displayName --format csv 2>/dev/null | grep -i "review profile" \
      | head -1 | cut -d, -f1 | tr -d '"\r')
if [ -n "$rp" ]; then
  $kc update "authentication/flows/first%20broker%20login/executions" -r agentpm \
    -b "{\"id\":\"$rp\",\"requirement\":\"DISABLED\"}" \
    && echo "prod-bootstrap: first-broker-login review-profile disabled"
fi

echo "prod-bootstrap: done"
