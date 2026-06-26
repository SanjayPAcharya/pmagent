# Reference: Social Login Setup (Google · Microsoft · GitHub)

> Operational runbook for **Phase 2.8.5** (in-app OAuth). Register one OAuth app per provider, paste the credentials into `sourcecode/.env`, and recreate `keycloak-init`. Keycloak brokers the providers; the app's buttons use `idpHint` so the Keycloak login page is skipped. **Do this before deploying** (and again with prod URLs in Phase 3).

## How it fits together
- The browser button → `keycloak.login({ idpHint: '<provider>' })` → Keycloak's **broker endpoint** → the provider's consent screen → back to Keycloak → back to the app with a token.
- Each provider therefore needs **one thing from us**: its OAuth **redirect/callback URI** must point at Keycloak's broker endpoint:
  ```
  <KEYCLOAK_URL>/realms/agentpm/broker/<alias>/endpoint
  ```
  where `<alias>` is `google` | `microsoft` | `github`.
- And we need **two things from the provider**: a **Client ID** and a **Client secret**, which go into `sourcecode/.env` (never committed). `keycloak-init` reads them and creates the identity providers.

### Redirect URIs to register

| Provider | alias | Dev redirect URI | Prod redirect URI (Phase 3) |
|---|---|---|---|
| Google | `google` | `http://localhost:8080/realms/agentpm/broker/google/endpoint` | `https://auth.<domain>/realms/agentpm/broker/google/endpoint` |
| Microsoft | `microsoft` | `http://localhost:8080/realms/agentpm/broker/microsoft/endpoint` | `https://auth.<domain>/realms/agentpm/broker/microsoft/endpoint` |
| GitHub | `github` | `http://localhost:8080/realms/agentpm/broker/github/endpoint` | `https://auth.<domain>/realms/agentpm/broker/github/endpoint` |

> Google and Microsoft let you list **multiple** redirect URIs on one app (add dev + prod to the same app). **GitHub allows only one callback URL per OAuth app**, so register a **separate** GitHub OAuth app for prod (or update the single URL at cutover).

---

## 1. Google — Google Cloud Console
1. Go to <https://console.cloud.google.com/> → create or select a project (e.g. "PMAgent").
2. **APIs & Services → OAuth consent screen**: User type **External**; app name **PMAgent**, support email, developer email. Scopes: `openid`, `email`, `profile`. While in "Testing", add your Google account under **Test users** (or **Publish** the app).
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**, name **PMAgent (Keycloak)**.
   - **Authorized redirect URIs**: add the Google row(s) from the table above.
   - (Authorized JavaScript origins are not needed — the token exchange is server-side in Keycloak.)
4. Create → copy **Client ID** and **Client secret**.
5. Put them in `.env`:
   ```
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   ```

## 2. Microsoft — Azure / Microsoft Entra ID
1. Go to <https://portal.azure.com/> → **Microsoft Entra ID → App registrations → New registration**.
2. Name **PMAgent**. **Supported account types**: pick "Accounts in any organizational directory **and** personal Microsoft accounts" for the broadest reach (matches Keycloak's `microsoft` provider on the `common` tenant). Use a single-tenant option only if you mean to restrict to your org.
3. **Redirect URI**: platform **Web**, value = the Microsoft dev URI from the table (add the prod URI later under **Authentication → Add a platform / Add URI**).
4. **Register** → on Overview copy **Application (client) ID**.
5. **Certificates & secrets → New client secret** → copy the secret **Value** (shown once; not the Secret ID).
6. **API permissions** → Microsoft Graph → Delegated → ensure `openid`, `email`, `profile`, `User.Read`.
7. Put them in `.env`:
   ```
   MICROSOFT_CLIENT_ID=...        # Application (client) ID
   MICROSOFT_CLIENT_SECRET=...    # the secret VALUE
   ```

## 3. GitHub — Developer settings → OAuth Apps
1. Go to <https://github.com/settings/developers> → **OAuth Apps → New OAuth App**.
2. **Application name** PMAgent; **Homepage URL** `http://localhost:3000` (prod: your app URL).
3. **Authorization callback URL** = the GitHub dev URI from the table. (One URL per app → make a second app for prod.)
4. **Register application** → copy **Client ID**; **Generate a new client secret** → copy it.
5. Put them in `.env`:
   ```
   GITHUB_CLIENT_ID=...
   GITHUB_CLIENT_SECRET=...
   ```

---

## 4. Apply + verify
From `sourcecode/`:
```bash
docker compose up -d --force-recreate keycloak-init
docker compose logs keycloak-init     # expect "idp google create/update", etc. (no "skipped")
```
Then open <http://localhost:3000> → **Continue with Google/Microsoft/GitHub** → you should land on the provider's consent screen and return signed in. A first-time login **auto-creates** the account (the first-broker "Review Profile" step is disabled) and lands you in the app — no Keycloak page in between.

Leaving any provider's `*_CLIENT_ID` blank makes `keycloak-init` **skip** that provider; its button then falls back to the Keycloak login page until you add credentials.

## Notes & security
- **Secrets never in git.** They live only in `sourcecode/.env` (gitignored) and are injected into Keycloak at runtime by `keycloak-init`. `.env.example` documents the keys with empty values.
- **Account linking** is on **verified email** (`trustEmail`). Google and Microsoft verify email; **GitHub email can be unverified or private** — Keycloak's `github` provider requests the `user:email` scope, but treat GitHub-sourced email as lower-trust to avoid account-collision linking.
- **Prod (Phase 3):** add the `https://auth.<domain>/...` redirect URIs (new GitHub app), set the same env keys in the prod env, and run the same `keycloak-init` step. See [12-docker-and-deployment.md](12-docker-and-deployment.md).
- This is **distinct** from the GitHub **App** the Code Agent uses for repo read/write in Phase 5 (see [10-local-dev-and-github-app.md](10-local-dev-and-github-app.md)) — that's repo access, this is login identity.
