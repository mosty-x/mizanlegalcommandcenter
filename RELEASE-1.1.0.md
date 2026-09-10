# Mizan 1.1.0 — SSH workflow provider

Built from the user-supplied 1.0.0 ZIP. This is a new source release for deployment; the live Railway service was not modified.

## Changed files and responsibilities

| Kind | Files | Responsibility |
|---|---|---|
| modify | `components/provider-vault.tsx`, `app/globals.css` | SSH provider option, conditional credential fields, key-file input, guide download, saved versus tested status, form error recovery. |
| modify | `components/tool-workspace.tsx`, `components/transparency-view.tsx` | Explain what is sent, show remote execution progress and execution provenance. |
| modify | `lib/ai/providers.ts`, `lib/config-schemas.ts` | Extend provider and office-policy schemas while retaining existing API providers. |
| create | `lib/ai/ssh-settings.ts` | Validate SSH inputs and administrator target allowlist. |
| create | `lib/server/ssh-transport.ts` | Authenticated, fingerprint-pinned SSH transport, fixed command, limits and cleanup. |
| create | `lib/server/ssh-workflow.ts` | Prepare original documents and structured workflow request; validate remote result. |
| modify | `app/api/providers/route.ts`, `app/api/providers/test/route.ts`, `app/api/workflows/run/route.ts` | Encrypt SSH settings, perform readiness check and route all five tools to the remote executor. |
| modify | `lib/security.ts`, `lib/server/errors.ts` | Safe Egyptian Arabic messages for transport failures. |
| config | `package.json`, `package-lock.json`, `next.config.ts`, `.env.example`, `public/examples/provider-catalog.json` | Dependencies, standalone external module, host allowlist and opt-in policy example. |
| create | `ssh-server/mizan-workflow.mjs`, `ssh-server/openai-compatible-handler.mjs`, `ssh-server/receiver.example.json` | Remote stdio receiver with configurable engine module and working single-call reference handler. |
| test | `tests/ssh-fixture.mjs`, `tests/ssh-transport.test.mjs`, `tests/ssh-receiver.test.mjs`, `scripts/smoke-production.mjs` | SSH handshake and failure tests, receiver contract test, production API integration across all five tools. |
| docs | `README.md`, `SECURITY.md`, `public/ssh-gateway-guide.md`, this file | Setup, upgrade, protocol and practical limits. |

No database migration. Existing API-key rows still decrypt as before; SSH rows encrypt a structured settings object in the existing credential envelope. A saved office policy is never broadened automatically.

## Validation executed

- 20 tests passed, including the eight pre-existing source/structure checks and executable SSH/receiver tests. Transport tests use real SSH protocol, generated local keys, wrong-fingerprint denial before authentication, allowlist/key rejection, malformed/mismatched response, output limit, disconnect and timeout.
- Production `next build` passed; lint and TypeScript checks passed.
- Built standalone server smoke passed: first/returning visit and terms gate, existing API-provider save/delete, SSH save/test, secret omission in list responses, second-visitor denial, original-document delivery, all five remote workflows, valid/invalid citation membership and persisted results.
- The shipped remote receiver was executed as a process against a local synthetic OpenAI-compatible service; health/run/invalid-operation behavior passed.
- Production dependency audit reported zero vulnerabilities at verification time.

## Limits of the evidence

Results in tests are explicitly synthetic, not legal output quality measurements. No real AI credentials or user SSH host were supplied. Remote health proves protocol/config readiness, not live model inference. Cloud Browser refused access to the local preview URL (`ERR_BLOCKED_BY_CLIENT`); no successful visual browser QA is claimed. Docker image execution and Railway deployment were not performed here; the equivalent Next standalone server was run locally.

Before use, configure `ALLOWED_SSH_HOSTS`, install or adapt the receiver on your SSH host, supply its credentials in Settings, and test with non-sensitive documents. Keep existing encryption/session keys and persistent volume during upgrade. Current deployment still uses cookie-based visitor identity rather than account login. See the guide and security document for remote trust and timeout limitations.
