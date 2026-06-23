-- Runs once on first init of the dev Postgres container (selfhost-data profile).
-- The `agentpm` database already exists (POSTGRES_USER=agentpm → default DB).
-- Create the separate Keycloak database and the extensions AgentPM needs.

CREATE DATABASE keycloak;
CREATE DATABASE agentpm_test;  -- used by the API test suite

\connect agentpm
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;
