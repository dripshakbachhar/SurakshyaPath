# Security Audit — Phase 0

**Scope:** Static review of the audited repository snapshot. This is not a penetration test.

## Existing controls observed

- Express JSON body limit is configured to 32 KB.
- `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, and a Permissions-Policy header are set centrally.
- `X-Powered-By` is disabled.
- Incident submission validates coordinates, incident type, and allowed time window.
- Report notes are trimmed and length-limited.
- A process-local in-memory rate limiter is applied to report submission.
- Malformed JSON receives a controlled 400 response.
- Unexpected errors return a generic 500 response.
- `.env` and `node_modules/` are ignored by Git.
- Research API is read-only and its POST behavior is covered by a test.
- Research UI escapes most string values inserted into generated HTML; full sink-by-sink review remains necessary.

## Findings and risks

### SEC-01 — No demonstrated production authentication/authorization (High for internet exposure)
The application includes anonymous report submission and the security policy describes it as a local/research prototype. No production authentication or authorization boundary was established in this audit.

**Action:** Keep deployment private/local until a threat model and access-control design are approved, or explicitly constrain public deployment to read-only research artifacts.

### SEC-02 — In-memory rate limit is not durable or multi-instance (Medium/High depending on exposure)
Rate-limit state is held in a process-local Map. It resets on restart and is not shared across instances.

**Action:** For production exposure, use a shared rate-limiting mechanism or managed edge controls. Do not represent the current limiter as production-grade abuse prevention.

### SEC-03 — File-backed incident data requires deployment review (High for production)
Incident data is persisted to a local JSON file. This is not a safe assumption for ephemeral or multi-instance serverless execution.

**Action:** Do not enable public write operations in a serverless deployment without durable storage, access control, retention policy, auditability, and backup/recovery design.

### SEC-04 — Content Security Policy not observed in inspected server headers (Medium)
The inspected central middleware sets several headers but does not set a Content-Security-Policy header.

**Action:** Review actual frontend script/style dependencies and inline usage before defining a CSP. Add a policy in report-only mode first; do not deploy a restrictive policy that breaks the application without testing.

### SEC-05 — Dependency vulnerability state unknown (High pending evidence)
The manifest declares Express `^4.19.2`; the lockfile and current audit output must be examined together. A prior local report indicated three vulnerabilities, but package names, advisory identifiers, and affected dependency paths were not available.

**Action:** Obtain current `npm audit --json`; remediate only verified affected packages with compatibility testing. Do not use `npm audit fix --force` as a blind operation.

### SEC-06 — Data privacy and retention policy not fully established (Medium)
The legacy report endpoint accepts a free-text note and coordinates. The application is described as experimental, but production retention, deletion, access, and incident-response policy were not established.

**Action:** Keep sample/synthetic usage clearly distinguished from any real user-submitted information. Define privacy, retention, access, and deletion policies before real-world data collection.

## Secret handling

The inspected `.gitignore` excludes `.env`, but ignore rules alone do not prove secrets have never been committed. A repository-history secret scan was not performed.

**Required follow-up:** Run a secret scanner across current files and repository history using an approved tool; do not print secret values in reports.

## Security verification not performed

- No penetration test.
- No dynamic endpoint fuzzing.
- No browser security test.
- No repository-history secret scan.
- No current package-level vulnerability report.
- No production deployment test.

## Conclusion

The code has basic local-prototype safeguards. It is not established as production-secure. Public exposure, durable writes, authentication, privacy controls, dependency status, and CSP remain release gates.
