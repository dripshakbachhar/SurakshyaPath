# Security Policy

## Scope

SurakshyaPath is an experimental local/research application. It is not designed for production handling of sensitive incident reports.

## Reporting a vulnerability

Please do not publish exploitable security details in a public issue. Contact the repository maintainer privately through GitHub with:

- a concise description of the vulnerability
- affected endpoint/file
- reproduction steps
- potential impact
- a suggested mitigation, if known

## Current security posture

The application includes JSON request-size limits, basic security headers, coordinate/type validation, a lightweight in-memory report rate limit, and anonymous report storage. These controls are appropriate for local experimentation but are not a substitute for production authentication, durable rate limiting, audit logging, secret management, encrypted storage, and a formal threat model.
