# Security baseline

## SSH provider added in 1.1.0

- Exact administrator-configured `ALLOWED_SSH_HOSTS` entries (`host:port`), resolved once to an IPv4 address per connection. Explicitly allowed internal/loopback hosts are supported for colocated workers; allowlisting grants access and must not be delegated to untrusted visitors.
- Required SHA256 host fingerprint checked before public-key authentication or sending work; private keys/passphrases encrypted in the existing per-visitor vault. Public responses omit these values.
- Fixed `/usr/local/bin/mizan-workflow --stdio` command; no user-specified shell commands, PTY, agent forwarding or implicit retry. See ssh2 API documentation: https://github.com/mscdex/ssh2
- 90-second deadline, 120 MB encoded input, 1.5 MB output, bounded discarded stderr, one in-flight SSH request per host/port and four per Node process. Aborted connections do not guarantee cancellation of custom remote tasks; remote engines need idempotency by requestId.
- The remote engine is trusted to handle original documents and all customization. It must enforce its own access, retention, tool and prompt-injection controls. Local source checks establish reference membership, not legal truth or semantic support.
- Existing cookie-only visitor isolation is not account authentication or team authorization. Restrict access to the deployment before supplying real SSH credentials. No claim of complete OWASP coverage or production penetration testing is made.

This product handles legal documents and third-party AI credentials. Its security model assumes that uploaded documents, model output, filenames, configuration files, and provider responses are untrusted.

## Enforced controls

| Risk area | Control in this build |
|---|---|
| Broken access control / IDOR | Every database read, mutation, blob path, workflow result, and provider lookup is scoped to a cryptographically signed visitor ID. |
| Session tampering | The browser receives only a random ID plus HMAC signature in an HttpOnly, Secure, SameSite cookie; forged or edited values are rejected with constant-time comparison. |
| Credential exposure | Provider keys are encrypted server-side with AES-256-GCM, bound to user and provider IDs through authenticated additional data, never returned by APIs, and never stored in browser storage. |
| Injection / unsafe output | Zod validates requests and model JSON; React escapes rendered output; the model has no tools or external-action capability; references are checked against server-generated source IDs. |
| SSRF | Provider endpoints require HTTPS, no credentials or custom ports, exact hostname allowlisting, and redirect blocking. |
| Malicious uploads | Extension, MIME type, magic bytes, decoded size, extracted-text size, filename, and document-count limits are enforced; blobs and extracted text are encrypted at rest. |
| Prompt injection | Uploaded text is explicitly delimited as untrusted data; document instructions are ignored by policy; model citations are verified after generation. |
| Resource abuse | Request and response size limits, AI timeout, per-user hourly rate limiting, document/chunk caps, and token caps are enforced. |
| Sensitive logging | Audit events contain IDs and bounded operational metadata only, not document content, prompts, API keys, or AI output. |
| Browser attacks | CSP, frame denial, HSTS, MIME sniffing prevention, permissions restrictions, same-origin mutation checks, and no-store API responses are set. |
| Unsafe automation | The five tools produce analysis only. Human approval is schema-enforced and external actions are schema-forbidden. |

## OWASP coverage target

The threat model is organized against OWASP Top 10 (2025), OWASP API Security Top 10 (2023), and OWASP Top 10 for LLM Applications (2025). CWE is a taxonomy rather than a finite certification checklist, so this repository does not claim that one scan proves coverage of a “Top 1000.” Relevant classes are handled through design controls, dependency review, lint/build gates, and focused regression tests.

## Residual risks before production rollout

- A qualified security review and penetration test are still required before real client matters are processed.
- Provider data-processing terms, regional routing, retention, and professional-secrecy obligations must be approved by the firm.
- The current CSP permits inline framework scripts/styles for runtime compatibility; nonce-based CSP should be evaluated when the hosting runtime exposes a reliable per-request nonce path.
- Malware scanning and OCR are not included in this pilot. PDF and DOCX files are parsed client-side and stored encrypted, but should pass through a dedicated scanning service in a broader deployment.
- Key rotation, legal hold, matter-level ethical walls, SSO group authorization, and formal backup/restore exercises belong in the production control plane.
- Cookie identity is device-local, not an account system. Clearing browser storage or changing devices creates a new isolated workspace.
- SQLite requires one application replica attached to one Railway Volume. Horizontal replicas require migration to a network database and object store.

## Verification

Run `npm run lint`, `npm test`, `npm run build`, `npm run smoke`, and `npm audit --omit=dev` before deployment.
