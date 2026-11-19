# Deployment and privacy guide

## Operating mode policy

SurakshyaPath has two supported modes:

- **Local research**: intended for one researcher on a trusted machine.
  Ordinary non-production local development defaults to this mode to preserve
  the existing workflow. It uses best-effort JSON files and permits imports,
  switching, and demo community reports. State is shared by every visitor of
  the process.
- **Public read-only**: the required mode for any public deployment until a
  durable database and real server-side authorization model exist. It serves
  canonical synthetic data and fixed research results; all data mutations are
  disabled.

Set `SURAKSHYA_MODE=public-read-only` explicitly on every public host,
regardless of provider. `NODE_ENV=production` and recognized hosting
environment markers also select read-only mode. An unsupported mode, or a
request for local research writes from a recognized deployment, fails closed.
Do not set `SURAKSHYA_MODE=local-research` on an internet-facing host. No
environment variable enables public writes.

For local work, use `npm ci` followed by `npm run local`. The local launcher
binds to loopback by default. Setting `HOST` can expose the service to other
machines; doing so does not add authentication or user isolation.

## Storage, access, and retention

In local research mode, JSON files are written under `data/` or the configured
`SURAKSHYA_DATA_DIR`. Imports and community reports remain in separate files.
The local adapter uses atomic rename for replacement but is not a managed
database: it provides no encryption, transaction isolation, multi-process
locking, `fsync` durability, automatic expiration, or managed backup. Imported
records remain until a researcher manually removes the runtime files. Anyone
with access to the host filesystem or application process can read them.

Public read-only mode does not initialize a persistent write adapter and does
not accept imports, dataset switches, or community reports. It does not expose
visitor-specific storage.

The browser parses a selected CSV/JSON file locally. On submission, the mapped
records—not the original file—are transmitted to the application server. Do
not upload personally identifiable or sensitive incident records to an
unsecured or publicly accessible deployment.

## Network and offline behavior

The app does not send records to an external analysis service. The browser
loads Leaflet, Leaflet.heat, and the landing-page Three.js illustration from
cdnjs. The map loads tiles from OpenStreetMap; tile requests disclose the
visitor's network address and requested map area to that provider. No
third-party analytics or advertising SDK is included.

The service worker may cache the landing page and a small allowlist of static
same-origin assets. It never caches `/api/` responses, imported records, or
community reports. If the network is unavailable, the workspace is not
available offline; an offline notice explains that current data must be
retrieved from the server.

## Future multi-user deployment

Do not add a client-only login screen as a substitute for authorization. A
multi-user deployment would require a durable shared database, server-side
authentication and authorization, explicit per-user or shared dataset
ownership, CSRF/origin policy, distributed rate limiting, audit and retention
controls, and a backup/recovery plan. Until that architecture exists, public
writes remain disabled.

## Verification

Before a deployment, run:

```bash
npm ci
npm test
npm run validate
npm run smoke
npm run research
npm run figures
npm audit --omit=dev
```

Confirm the runtime reports `public-read-only` and that imports, switching,
and report writes are rejected. Local JSON persistence is not production
storage.
