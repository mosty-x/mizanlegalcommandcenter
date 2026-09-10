import { z } from "zod";
import { approveRun, findRun, listRuns, type WorkflowRunRow } from "@/db/repository";
import { decryptBytes } from "@/lib/server/crypto";
import { apiError } from "@/lib/server/errors";
import { isAuthResponse, requireApiUser } from "@/lib/server/auth";
import { requireBucket } from "@/lib/server/runtime";
import { assertSameOrigin, noStoreJson, parseJsonWithLimit, safeIdentifierSchema, toolSlugSchema } from "@/lib/security";
import { writeAuditEvent } from "@/lib/server/audit";
import { readCorpus,readNodes,corpusRevisionNow } from "@/lib/rag/store";
import { digest } from "@/lib/rag/retrieval";
import { loadFirmConfiguration,configurationRevisionNow } from "@/lib/server/config";
import { findDocuments } from "@/db/repository";
import { ragPolicySchema } from "@/lib/rag/contracts";
import { eligibleCorpus } from "@/lib/rag/evidence";
import { getDag } from "@/lib/rag/definitions";

import { profileRevisionNow } from "@/lib/rag/profile-store";

async function readOutput(userId: string, row: WorkflowRunRow) {
  if (!row.outputKey || !row.outputIv) throw new Error("WORKFLOW_OUTPUT_UNAVAILABLE");
  const stored = await requireBucket().get(row.outputKey);
  if (!stored) throw new Error("WORKFLOW_OUTPUT_UNAVAILABLE");
  const plain = await decryptBytes(await stored.arrayBuffer(), row.outputIv, userId, `workflow-output:${row.id}`);
  return JSON.parse(new TextDecoder().decode(plain)) as unknown;
}

export async function GET(request: Request) {
  const user = await requireApiUser();
  if (isAuthResponse(user)) return user;
  try {
    assertSameOrigin(request);
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (id) {
      const safeId = safeIdentifierSchema.parse(id);
      const row = findRun(user.id, safeId);
      if (!row) throw new Error("WORKFLOW_NOT_FOUND");
      const trace = row.status === "completed" ? await readOutput(user.id, row) : null;
      return noStoreJson({ run: { ...row, nodes:readNodes(user.id,safeId), ...((trace as Record<string, unknown> | null) ?? {}) } });
    }
    const rawTool = url.searchParams.get("tool");
    const tool = rawTool ? toolSlugSchema.parse(rawTool) : null;
    const rows = listRuns(user.id, tool).map(({ id, toolSlug, title, status, model, sourceCount, verifiedCitationCount, durationMs, approvedAt, createdAt }) => ({ id, toolSlug, title, status, model, sourceCount, verifiedCitationCount, durationMs, approvedAt, createdAt }));
    return noStoreJson({ runs: rows });
  } catch (error) {
    return apiError(error, 400);
  }
}

const approvalSchema = z.object({ runId: safeIdentifierSchema, approved: z.literal(true) });

export async function PATCH(request: Request) {
  const user = await requireApiUser();
  if (isAuthResponse(user)) return user;
  try {
    assertSameOrigin(request);
    const input = approvalSchema.parse(await parseJsonWithLimit(request, 8_000));
    const row=findRun(user.id,input.runId);
    if(!row)throw new Error("WORKFLOW_NOT_FOUND");
    if(row.workflowVersion.startsWith("egypt-rag")){
      const saved=await readOutput(user.id,row) as {rag:{approvalEligible:boolean;corpusRevision:string;configurationHash:string;configurationRevision:string;profileRevision?:string;asOf:string;framework:string;documentIds:string[]};claims:Array<{lawCitations:Array<{sourceId:string}>}>};
      const config=await loadFirmConfiguration(user.id),corpus=await readCorpus(user.id);
      if(!saved.rag.approvalEligible||saved.rag.corpusRevision!==corpus.revision||saved.rag.configurationHash!==digest(config)||findDocuments(user.id,saved.rag.documentIds).length!==saved.rag.documentIds.length)throw new Error("RAG_APPROVAL_DENIED");
      const policy=ragPolicySchema.parse(config["rag-policy"]);
      const allowed=new Set(eligibleCorpus(corpus.units,getDag(toolSlugSchema.parse(row.toolSlug)),policy,saved.rag.asOf,saved.rag.framework).map(u=>u.id));
      if(saved.claims.some(c=>c.lawCitations.some(ref=>!allowed.has(ref.sourceId))))throw new Error("RAG_APPROVAL_DENIED");
      // A revocation or policy edit during asynchronous reads also blocks approval.
      if(corpusRevisionNow(user.id)!==saved.rag.corpusRevision||configurationRevisionNow(user.id)!==saved.rag.configurationRevision||(saved.rag.profileRevision&&profileRevisionNow(user.id,toolSlugSchema.parse(row.toolSlug))!==saved.rag.profileRevision))throw new Error("RAG_APPROVAL_DENIED");
    }
    const approvedAt = new Date().toISOString();
    if (!approveRun(user.id, input.runId, user.email, approvedAt)) throw new Error("WORKFLOW_NOT_FOUND");
    await writeAuditEvent({ userId: user.id, runId: input.runId, eventType: "workflow.approved", detail: { approved: true } });
    return noStoreJson({ ok: true, approvedAt });
  } catch (error) {
    return apiError(error, 400);
  }
}
