# Validation report — Egyptian RAG 2.1.0

Review date: 2026-09-10. All datasets below are artificial software fixtures, not Egyptian legal propositions. No customer files or provider credentials were supplied to these tests.

| Gate | Result | Evidence / scope |
|---|---|---|
| Automated tests | 56 passed, 0 failed | Existing tests plus executable DAG, retrieval, grounding, cache, corpus, specialization, engineering-DAG and remote-handler tests |
| TypeScript | Passed | `npx tsc --noEmit --pretty false` |
| Lint | Passed, 0 errors/warnings | `npm run lint`; npm itself reports an environment proxy deprecation warning |
| Production build | Passed | `npm run build`; all five tool routes and the knowledge route build |
| Production HTTP smoke | Passed | A real standalone server, signed visitors, credential vault, import/policy endpoints, all five local DAGs and all five full DAGs through a real test SSH connection, plus profile versions, prompt forwarding, corpus corrections and approval invalidation |
| Retrieval scorer | Passed | Exact arithmetic on a hand-computed rank case and refusal to score an empty evaluation set |
| Production dependency audit | 0 known advisories reported | `npm audit --omit=dev --json` on this package lock at review time; not a guarantee of no vulnerabilities |
| Visual browser review | Not completed | No installed Chromium executable; browser download failed to complete. No screenshot or browser interaction pass is claimed |
| Docker/Railway deployment | Not executed | Dockerfile and Railway configuration supplied; Next standalone runtime exercised locally, not an actual Railway deployment |
| Live AI / legal quality | Not evaluated | No paid neural provider calls or lawyer-reviewed gold dataset were used |
| Independent penetration/load/recovery test | Not performed | Necessary scope must be defined for an institutional release |

## Behavioral coverage

- All five DAG definitions execute eight nodes and yield distinct typed products. Their two extraction steps are separate model calls.
- Empty allowed memory causes abstention with zero neural inference calls. Low rerank relevance cannot fall back to unsupported analysis.
- Incorrect source IDs, invented quotations, treating a contract as law, or evidence from another document scope fail deterministic gates.
- A separate verification stage can withhold a conclusion even when its source ID is valid. Missing or duplicate verdicts cannot count as approval.
- Source/tool/topic/date/framework limits, old and overlapping versions, and selecting the applicable institutional arbitration rules are exercised.
- Cycles, unknown dependencies and skipping mandatory gates invalidate a DAG. Findings that depend on withheld items are pruned transitively.
- Encrypted storage, per-visitor cache separation, TTL and source withdrawal are exercised. Final corpus revisions detect withdrawal while asynchronous decryption was still in progress.
- The transport checks embedding shape, duplicate indices and endpoint roles. A failed required service cannot fall back to a language-model-only answer. Generation responses enforce their byte limit during streaming.
- The cache warm case produces embedding and rerank hits; another document scope produces misses. vLLM salt differs by user/matter and is absent in provider-managed mode.
- The production smoke exercises actual SSH handshakes and a remote handler that imports the same Egyptian engine. Its neural endpoints are deterministic fetch doubles. This tests integration and contracts, not neural accuracy.
- Approval is denied after a source is withdrawn. Client-brief generation requires an explicit document-sharing confirmation. Tests also deny access across user and tool boundaries.

## Additional 2.1 behavioral coverage

- User/tool-scoped specialization versions are encrypted. Old revisions remain readable; rollback writes a new version. Optimistic revision checks reject concurrent overwrites.
- Custom instructions reach extraction, analysis and verification. An instruction requesting an unsupported answer cannot bypass the deterministic citation gate in the tested adversarial case.
- A specialization cannot introduce a source outside the tool catalog or widen the office allowlist. An empty source intersection produces zero model calls.
- The memory DAG filters wrong-tool and stale units and records a snapshot. The context DAG verifies evidence identities, orders explicitly dated facts and rejects excess context without silent truncation.
- Required legal units enter the context even when the reranker did not select them. A missing or withdrawn required unit stops execution before model inference; it cannot be replaced with model knowledge.
- A lawyer's corpus correction uses an atomic replacement and rejects a stale editor revision. The production HTTP smoke verifies this invalidates previous approval.
- The production smoke verifies specialization version/hash reaches the remote engine, custom instructions reach its model call, and changing a specialization blocks approval of an older report.

## Important interpretation

The tests establish software behavior for the cases tested. They do not establish 100% OWASP coverage, zero hallucinations, trained-lawyer identity, authoritative imported-law authenticity, complete Egyptian legal coverage, or Kirkland certification. Earlier static source checks are retained as regressions and are not presented as penetration tests.

Use `EVALUATION.ar.md` for a lawyer-owned evaluation, and `PRODUCT-REVIEW.ar.md` for institutional controls not yet implemented. Thresholds and observed cache counts are operational values, not legal confidence scores. See the shipped test/build/smoke logs for reproducible results.
