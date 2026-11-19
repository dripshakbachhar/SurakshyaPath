# Security, deployment, and privacy

## Intended use

SurakshyaPath is an experimental research platform for investigating how
explainable spatial-prioritization models affect downstream route and
resource-allocation experiments. Its rankings, allocations, route comparisons,
and intelligence summaries are not validated real-world operational
instructions, crime predictions, or evidence of improved public-safety
outcomes.

Do not upload personally identifiable or sensitive incident records to an
unsecured or publicly accessible deployment.

## Operating modes

The application supports two modes:

- **Local research**: intended for one researcher on a trusted local machine.
  Local JSON persistence, dataset imports, dataset switching, and demo
  community-report writes are enabled. The server binds to `127.0.0.1` by
  default; setting `HOST` can expose it on other interfaces. State is shared
  by every visitor/request reaching that server process. This is not
  per-user isolation.
- **Public read-only**: canonical synthetic dashboard data and fixed research
  results remain available. Imports, dataset switching, and community-report
  writes are disabled. This mode is selected by
  `SURAKSHYA_MODE=public-read-only`, `NODE_ENV=production`, or recognized
  deployment environment markers.

Without explicit mode configuration, ordinary non-production local
development defaults to local research to preserve the existing workflow.
An unsupported `SURAKSHYA_MODE` or a local-research setting detected inside a
deployment fails closed to read-only behavior. There is no supported setting
that enables public writes using the local JSON adapter.

The public-write restriction applies beyond Vercel. A future multi-user
deployment needs a durable shared database, authentication and authorization,
per-user or explicitly shared dataset ownership, CSRF/origin policy,
distributed rate limiting, audit/retention controls, and an operational
backup/recovery plan. A login screen without these server-side controls is
not sufficient.

## Data boundaries and shared state

- The canonical synthetic benchmark and its stored experiment results are
  immutable through the web API.
- Imported datasets are stored separately from synthetic demo data and
  community reports. Imports have a distinct dataset identifier and provenance
  metadata; switching retains that metadata.
- Community reports are stored separately in `community-reports.json` and
  are combined with the synthetic demo only for the local live dashboard.
- Dataset-specific research output identifies the imported source dataset;
  fixed results identify the canonical synthetic benchmark.
- These protections do not provide ownership or privacy between users in
  local research mode. The active dataset and report set are process-wide;
  switching or importing changes what every visitor of that process sees.

## API inventory

Read-only endpoints:

- `GET /api/health`, `/api/config`, `/api/research/summary`, `/api/incidents`,
  `/api/dataset`, `/api/dataset/research`
- `GET /api/risk`, `/api/patrol`, `/api/allocation`, `/api/analytics`,
  `/api/data-quality`, `/api/intelligence`, `/api/diagnostics`, `/api/dashboard`

Mutations, restricted to local research mode:

- `POST /api/dataset/import`
- `POST /api/dataset/use-imported`
- `POST /api/dataset/use-demo`
- `POST /api/incidents`

JSON request bodies are limited to 4 MiB. Imports validate record count,
dataset names, field types, coordinates, dates, severity, and category/zone
counts. The storage adapter uses fixed internal filenames; dataset names are
never used as paths. Local JSON writes use a temporary file and atomic rename,
but do not provide database transactions, multi-process locking, `fsync`
durability, encryption, or managed backups.

Community reports are validated, limited in note length and coordinates, and
rate-limited in process memory. The rate limit is not distributed and may
share a proxy address when deployed behind a proxy. Forwarded client IP
headers are not trusted by Express unless separately configured; no proxy
trust setting is enabled by this application. The local mode is not an
internet-facing service.

Responses include a Content Security Policy, frame protection, MIME
sniffing protection, and a no-referrer policy. API responses are marked
`Cache-Control: no-store`. When a browser sends an `Origin` header, API
mutations require its host to match the request host. Requests without an
`Origin` header are still accepted for local command-line clients; this is
not authentication or authorization.

## Storage status and retention

Health and dashboard responses distinguish configured storage from observed
read/write success. An instantiated local adapter does not prove that the
filesystem is writable. Local JSON storage is best-effort filesystem
persistence, not a managed production database. A successful atomic rename
does not guarantee survival of host loss or storage failure.

In local research mode, runtime data is stored under `data/` by default, or
under `SURAKSHYA_DATA_DIR` when configured. Imported records persist until
the researcher removes the local files; there is no automatic expiration or
web deletion endpoint. The original CSV/JSON file is parsed in the browser;
the mapped records are transmitted to this application's server when import
is submitted. Anyone with access to the host filesystem or the local
application process can access stored data. The application does not encrypt
local files or implement per-user access control.

Public read-only mode does not accept or persist imports or community
reports. Its static synthetic data and fixed research results are shared with
all visitors.

The browser parses source files locally, but mapped records are transmitted
to the application server when submitted. The app does not send records to an
external analysis service. The browser loads Leaflet, Leaflet.heat, and the
landing-page Three.js visual from cdnjs; OpenStreetMap receives map-tile
requests, including the visitor's network address and requested map area.
There is no third-party analytics or advertising SDK.

The service worker caches only a small allowlist of static same-origin files
and the landing page. It does not cache `/api/` responses, imported records,
or community reports. The research workspace requires a network connection;
the offline page explains that current data was not cached.

See [docs/deployment.md](./docs/deployment.md) for deployment configuration
and the requirements for a future multi-user system.

## Reporting a security issue

Please do not publish exploitable security details in a public issue. Contact
the repository maintainer privately through GitHub with a concise description,
affected endpoint/file, reproduction steps, potential impact, and a suggested
mitigation if known.
