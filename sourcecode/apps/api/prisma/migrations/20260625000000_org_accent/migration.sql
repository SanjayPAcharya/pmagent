-- G2: per-org accent color (hex string, nullable). Drives the --primary token
-- in the web app when viewing the org.
ALTER TABLE "Organization" ADD COLUMN "accentColor" TEXT;
