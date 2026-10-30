# Security and performance

Trace external input from entry point through validation, authorization, use,
and output. Identify realistic attack preconditions and consequences.

## Injection and unsafe execution

- SQL uses parameter binding, including dynamically selected identifiers.
- Subprocess calls avoid shell interpolation of untrusted data. Argument arrays
  still need option-injection checks and an appropriate executable boundary.
- File paths enforce allowed roots and account for traversal and symlinks.
- HTML rendering escapes by default; intentional HTML has appropriate sanitization.
- Untrusted values do not reach eval, unsafe deserialization, template execution,
  or prototype mutation.

## Authentication and authorization

- Protected endpoints authenticate and check resource ownership/permissions.
- Checks occur server-side; client validation is not authorization.
- Sessions, cookies, CSRF defenses, credentials, and token lifetimes fit the
  application's threat model.
- Passwords use an appropriate password-hashing algorithm, not plaintext or a
  fast general-purpose hash. Login, reset, and recovery paths resist abuse.
- Tenant boundaries hold in queries, caches, background jobs, and errors.

## Boundaries and data

- Inputs and external responses are parsed against complete runtime contracts.
- Uploads have type/content, size, destination, and processing limits.
- Outbound requests consider SSRF, redirects, timeouts, and response size.
- Secrets and sensitive data do not leak through commits, logs, error messages,
  telemetry, generated output, or API responses.
- Failures default to the safe state; partial work cannot bypass authorization.

## Dependencies

Inspect changed versions, sources, install hooks, and lockfile behavior. Check
known advisories when evidence is available. Do not claim a vulnerability scan
ran, or that no vulnerabilities exist, without actual evidence. License and
support requirements follow repository policy.

## Performance and resource lifecycle

- N+1 queries, unbounded reads, missing pagination, and inefficient access paths.
- Hot-path allocations, repeated rendering/work, and inappropriate cache keys.
- Blocking work on event loops and unbounded task or queue fan-out.
- Timeouts, backpressure, rate limits, cancellation, and retry amplification.
- Connections, locks, listeners, file handles, and timers released on all paths.
- Cache invalidation, memory growth, and load-dependent behavior.

Distinguish measured regressions from inferred scaling risks. State the input
size or traffic conditions that make a performance finding significant.
