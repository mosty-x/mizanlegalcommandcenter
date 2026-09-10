# Implementation change map

Base: Mizan Legal Command Railway 1.1.1. Final source package: 2.1.0.

The live Railway service was not modified in this task. The package preserves the existing encryption/visitor formats and adds four tables: legal units, scoped cache, node events, and immutable specialization revisions. No destructive database migration.

## Added

- `app/api/knowledge/route.ts`
- `app/api/specialization/route.ts`
- `app/knowledge/page.tsx`
- `app/specialize/page.tsx`
- `components/knowledge-workspace.tsx`
- `components/legal-unit-editor.tsx`
- `components/specialization-workspace.tsx`
- `docs/rag/ARCHITECTURE.ar.md`
- `docs/rag/BINDING.ar.md`
- `docs/rag/CHANGES.md`
- `docs/rag/EVALUATION.ar.md`
- `docs/rag/IMPLEMENTATION-PLAN.md`
- `docs/rag/PRODUCT-REVIEW.ar.md`
- `docs/rag/SOURCES.ar.md`
- `docs/rag/SPECIALIZATION.ar.md`
- `docs/rag/SSH.ar.md`
- `docs/rag/VALIDATION.md`
- `docs/rag/client-command.mmd`
- `docs/rag/context.mmd`
- `docs/rag/deal-room.mmd`
- `docs/rag/disputes.mmd`
- `docs/rag/enforceability.mmd`
- `docs/rag/memory.mmd`
- `docs/rag/regulatory.mmd`
- `docs/rag/ui-check.json`
- `docs/rag/validation-logs/build.txt`
- `docs/rag/validation-logs/dependency-audit.json`
- `docs/rag/validation-logs/lint.txt`
- `docs/rag/validation-logs/retrieval-scorer.txt`
- `docs/rag/validation-logs/smoke.txt`
- `docs/rag/validation-logs/tests.txt`
- `docs/rag/validation-logs/types.txt`
- `lib/rag/assembly.ts`
- `lib/rag/catalog.ts`
- `lib/rag/contracts.ts`
- `lib/rag/definitions.ts`
- `lib/rag/engine.ts`
- `lib/rag/evidence.ts`
- `lib/rag/profile-store.ts`
- `lib/rag/profile.ts`
- `lib/rag/retrieval.ts`
- `lib/rag/services.ts`
- `lib/rag/ssh.ts`
- `lib/rag/store.ts`
- `public/examples/rag-policy-ssh.json`
- `public/examples/rag-policy.json`
- `public/examples/rag/client-command/legal-unit-template.json`
- `public/examples/rag/client-command/rag-policy.json`
- `public/examples/rag/client-command/specialization-profile.json`
- `public/examples/rag/deal-room/legal-unit-template.json`
- `public/examples/rag/deal-room/rag-policy.json`
- `public/examples/rag/deal-room/specialization-profile.json`
- `public/examples/rag/disputes/legal-unit-template.json`
- `public/examples/rag/disputes/rag-policy.json`
- `public/examples/rag/disputes/specialization-profile.json`
- `public/examples/rag/enforceability/legal-unit-template.json`
- `public/examples/rag/enforceability/rag-policy.json`
- `public/examples/rag/enforceability/specialization-profile.json`
- `public/examples/rag/evaluation-template.json`
- `public/examples/rag/legal-unit-template.json`
- `public/examples/rag/regulatory/legal-unit-template.json`
- `public/examples/rag/regulatory/rag-policy.json`
- `public/examples/rag/regulatory/specialization-profile.json`
- `scripts/create-env.mjs`
- `scripts/evaluate-retrieval.mjs`
- `ssh-server/egypt-rag-handler.ts`
- `ssh-server/egypt-receiver.example.json`
- `ssh-server/mizan-workflow-wrapper.sh`
- `ssh-server/receiver.env.example`
- `tests/helpers/mock-ai-fetch.mjs`
- `tests/helpers/rag-fixtures.mjs`
- `tests/rag-engine.test.mjs`
- `tests/rag-specialization.test.mjs`
- `tests/rag-store-services.test.mjs`
- `workflows/egypt/client-command.json`
- `workflows/egypt/deal-room.json`
- `workflows/egypt/disputes.json`
- `workflows/egypt/enforceability.json`
- `workflows/egypt/regulatory.json`
- `workflows/engineering/context.json`
- `workflows/engineering/memory.json`

## Modified

- `.dockerignore`
- `.env.example`
- `.gitignore`
- `Dockerfile`
- `README.md`
- `app/api/runs/route.ts`
- `app/api/workflows/run/route.ts`
- `app/globals.css`
- `components/legal-shell.tsx`
- `components/number-field.tsx`
- `components/onboarding-gate.tsx`
- `components/provider-vault.tsx`
- `components/tool-workspace.tsx`
- `components/transparency-view.tsx`
- `db/index.ts`
- `lib/ai/providers.ts`
- `lib/client/extract-document.ts`
- `lib/config-schemas.ts`
- `lib/security.ts`
- `lib/server/config.ts`
- `lib/server/errors.ts`
- `lib/server/ssh-transport.ts`
- `lib/server/terms.ts`
- `lib/tool-definitions.ts`
- `package-lock.json`
- `package.json`
- `public/ssh-gateway-guide.md`
- `scripts/smoke-production.mjs`
- `ssh-server/mizan-workflow.mjs`
- `tests/security-workflows.test.mjs`
- `tests/ssh-fixture.mjs`

## Removed

None.

## Behavior and integration

Five typed Egyptian workflows execute eight specialized nodes each. Three-node memory and context DAGs prepare eligible legal knowledge and model context. The profile editor binds instructions, focus, source narrowing, required authorities and a bounded context budget to a versioned snapshot. The UI supports comparison/rollback and atomic source correction/export.

The fixed SSH receiver imports the same engine and receives the same profile/hash. Result validation repeats deterministic source and quotation checks on the application side. Stream limits bound provider output. Final synchronous corpus/config/profile checks prevent committing or approving a stale result during asynchronous updates.

There is no free-code execution, generated-answer knowledge ingestion, automatic legal action, or hidden fallback to the historical single-prompt implementation. Legacy code remains in the repository for compatibility/context but the new run API does not use it.

Additional product review uses published Kirkland guidance as a design benchmark and marks unimplemented institutional controls explicitly. This package is not a claim of Kirkland certification, complete Egyptian legal coverage, or measured legal accuracy.
