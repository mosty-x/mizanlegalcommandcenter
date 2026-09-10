# Egyptian evidence-bound workflows — implementation contract

Version 2.1.0 upgrades the existing Railway app in a separate deliverable. Existing visitors, credentials, document storage and historical outputs remain readable. New executions use the new engine only; no hidden fallback to the one-prompt implementation. User has requested this architectural upgrade; implementation proceeds under that authorization.

## Acceptance
Five runtime DAG definitions; tool-specific typed outputs; Egyptian reviewed corpus only; per-visitor and per-tool source policy; explicit document selection; Arabic lexical+dense retrieval with reciprocal rank fusion and mandatory neural reranking; exact quotation validation and separate semantic evidence review; withheld unsupported results; dated source validity; measured cache and node trace; no generated-result ingestion; no web search from workflow; explicit imports and revocation. AI cannot be guaranteed hallucination-free; uncertain material is withheld and remaining work requires human review.

## File map (before implementation)
- create lib/rag/contracts.ts: validated corpus, policy, stage outputs and evidence contracts.
- create lib/rag/catalog.ts: researched source identities, exact hosts and per-tool eligibility.
- create workflows/egypt/*.json (five): actual dependency graphs and tool-specific instructions consumed by runtime.
- create lib/rag/definitions.ts: load and validate graphs; no arbitrary code or tool execution from JSON.
- create lib/rag/retrieval.ts: Arabic BM25, dense cosine, reciprocal rank fusion, bounded candidate selection.
- create lib/rag/evidence.ts: quotation checks, temporal/source filters, claim gates and typed product assembly.
- create lib/rag/engine.ts: dependency scheduler, stage invocation, independent verification, deterministic report assembly.
- create lib/rag/store.ts: encrypted corpus and embedding/retrieval cache, audit-only node events, scoped invalidation.
- create lib/rag/services.ts: embedding/rerank/inference transports, budget/cancellation and safe cache scope.
- create app/api/knowledge/route.ts: authenticated corpus import/list/revoke and source policy save.
- create components/knowledge-workspace.tsx and app/knowledge/page.tsx: Egyptian memory configuration, explicit source attestation, import and withdrawal.
- modify app/api/workflows/run/route.ts: use evidence engine; no legacy fallback; honor existing provider policy.
- modify lib/ai/providers.ts: optional cancellation, opt-in vLLM cache salt and cache usage telemetry.
- modify lib/config-schemas.ts: validate new retrieval bindings and limits alongside legacy config.
- modify db/index.ts: additive cache, corpus and stage-event tables.
- modify lib/security.ts and lib/server/errors.ts: bounded request reading and safe new error codes.
- modify lib/server/storage.ts: enforce tool partition and expose source provenance.
- modify components/tool-workspace.tsx: effective date, institutional rules and client-sharing confirmation.
- modify components/transparency-view.tsx: evidence quotes, withheld counts, typed products and actual node trace.
- modify app/api/runs/route.ts: block approval of withheld/invalidated outputs, expose node trace on failures.
- modify components/provider-vault.tsx, components/legal-shell.tsx, lib/tool-definitions.ts, app/globals.css: memory navigation and truthful workflow descriptions.
- docs/config public/examples/rag/*, docs/rag/*, README.md, package.json, package-lock.json: reproducible setup, five diagrams, source evidence, limitations, version.
- test tests/rag-*.test.mjs: actual execution with deterministic provider doubles; temporal/source isolation; injected sources; fabricated citations; dependencies; cache invalidation; missing capabilities and provider failures.

## Intentional boundaries
No bundled paid legal corpus, no credentials, no law-firm usage ranking without evidence, no crawler bypasses, no assurance of zero hallucinations, no legal accuracy percentages invented. Provider credentials and a reviewed corpus are required for real legal execution. Existing cookie identity remains a visitor workspace, not an enterprise IAM system. Single Railway replica with persistent volume; no distributed queue or horizontal SQLite architecture introduced.

## Cache distinction
Embedding and retrieval caches are implemented locally, scoped and encrypted. KV/prefix cache is inference-server owned: stable prefixes and opt-in vLLM request salt are supported; no claim that the app implements GPU KV pages or speeds token decoding. Measure real deployment behavior before asserting savings.

## Validation
Run existing tests, executable DAG/evidence/retrieval/cache integration tests, TypeScript and production build. Test provider calls with deterministic doubles; disclose unavailable live API/SSH and Egyptian-law expert evaluation. Inference failure is an explicit failed run, never a fabricated successful report.

## User-directed specialization extension

Additional authorized scope: editable per-tool instructions with encrypted immutable revisions and rollback-as-new-revision; actual memory/context engineering DAGs; source pinning for mandatory references; source correction UI and complete corpus export; the same specialization and harness on the remote receiver. New code adds the specialization route, profile store, engineering runner, UI editors, and one additive database table.

Approval and result commit recheck corpus/config/profile revisions. The extension never grants model output executable authority and does not activate unlicensed source scraping. The 2.1 tests and HTTP smoke include version conflicts, pinned-reference abstention and forwarding to the remote engine.
