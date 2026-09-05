import { z } from "zod";
import { incrementRateLimit, insertRun, updateRunCompleted, updateRunFailed } from "@/db/repository";
import { callProvider } from "@/lib/ai/providers";
import { assertSameOrigin, noStoreJson, parseJsonWithLimit, safeIdentifierSchema, toolSlugSchema } from "@/lib/security";
import { apiError } from "@/lib/server/errors";
import { isAuthResponse, requireApiUser } from "@/lib/server/auth";
import { loadDocumentChunks, loadProviderForUser, storeEncryptedBlob } from "@/lib/server/storage";
import { buildWorkflowPrompt, parseAndVerifyWorkflowOutput } from "@/lib/workflows";
import { writeAuditEvent } from "@/lib/server/audit";
import { loadFirmConfiguration } from "@/lib/server/config";
import { runSshWorkflow } from "@/lib/server/ssh-workflow";

const WORKFLOW_VERSION = "1.1.0";
const runSchema = z.object({
  toolSlug: toolSlugSchema,
  providerId: safeIdentifierSchema,
  documentIds: z.array(safeIdentifierSchema).min(1).max(8),
  title: z.string().trim().min(2).max(180),
  objective: z.string().trim().min(4).max(2_500),
  jurisdiction: z.string().trim().min(2).max(120),
});

async function applyRateLimit(userId: string) {
  const bucket = "workflow-hour";
  const windowStart = Math.floor(Date.now() / 3_600_000) * 3_600_000;
  if (incrementRateLimit(userId, bucket, windowStart) > 30) throw new Error("RATE_LIMITED");
}

export async function POST(request: Request) {
  const user = await requireApiUser();
  if (isAuthResponse(user)) return user;
  let runId: string | null = null;
  const started = Date.now();
  try {
    assertSameOrigin(request);
    const input = runSchema.parse(await parseJsonWithLimit(request, 32_000));
    await applyRateLimit(user.id);
    const provider = await loadProviderForUser(user.id, input.providerId);
    const customization = await loadFirmConfiguration(user.id);
    const workflowConfig = customization["workflow-config"] as { enabledTools?: string[]; maxDocumentsPerRun?: number } | undefined;
    const providerCatalog = customization["provider-catalog"] as { allowedProviders?: string[]; approvedModels?: string[] } | undefined;
    const practicePolicy = customization["practice-policy"] as { permittedJurisdictions?: string[] } | undefined;
    if (workflowConfig?.enabledTools && !workflowConfig.enabledTools.includes(input.toolSlug)) throw new Error("CONFIG_POLICY_DENIED");
    if (workflowConfig?.maxDocumentsPerRun && input.documentIds.length > workflowConfig.maxDocumentsPerRun) throw new Error("CONFIG_POLICY_DENIED");
    if (providerCatalog?.allowedProviders && !providerCatalog.allowedProviders.includes(provider.config.provider)) throw new Error("CONFIG_POLICY_DENIED");
    if (providerCatalog?.approvedModels?.length && !providerCatalog.approvedModels.includes(provider.config.model)) throw new Error("CONFIG_POLICY_DENIED");
    if (practicePolicy?.permittedJurisdictions?.length && !practicePolicy.permittedJurisdictions.includes(input.jurisdiction)) throw new Error("CONFIG_POLICY_DENIED");
    const sourceData = await loadDocumentChunks(user.id, input.documentIds);
    const prompt = buildWorkflowPrompt({
      toolSlug: input.toolSlug,
      title: input.title,
      objective: input.objective,
      jurisdiction: input.jurisdiction,
      sources: sourceData.chunks,
      customization,
    });
    runId = crypto.randomUUID();
    const now = new Date().toISOString();
    insertRun({
      id: runId,
      userId: user.id,
      toolSlug: input.toolSlug,
      title: input.title,
      status: "running",
      providerId: input.providerId,
      model: provider.config.model,
      sourceCount: sourceData.chunks.length,
      workflowVersion: WORKFLOW_VERSION,
      createdAt: now,
      outputKey: null,
      outputIv: null,
      verifiedCitationCount: 0,
      durationMs: 0,
      inputTokens: null,
      outputTokens: null,
      errorCode: null,
      approvedAt: null,
      approvedBy: null,
      completedAt: null,
    });
    await writeAuditEvent({ userId: user.id, runId, eventType: "workflow.started", detail: { toolSlug: input.toolSlug, providerId: input.providerId, sourceCount: sourceData.chunks.length } });
    const providerResult = provider.config.provider === "ssh-gateway"
      ? await runSshWorkflow({ ...input, userId: user.id, secret: provider.apiKey,
          runId, profile: provider.config.model, sources: sourceData.chunks,
          sourceTruncated: sourceData.truncated, customization, prompt, signal: request.signal })
      : await callProvider({ ...provider, ...prompt });
    const allowedSourceIds = new Set(sourceData.chunks.map((source) => source.id));
    const output = parseAndVerifyWorkflowOutput(providerResult.text, allowedSourceIds);
    const verifiedCitationCount = output.findings.reduce((sum, finding) => sum + finding.verifiedSourceRefs.length, 0);
    const outputKey = `${user.id}/runs/${runId}/output.bin`;
    const trace = {
      output,
      sources: sourceData.chunks.map(({ id, documentId, fileName, page }) => ({ id, documentId, fileName, page })),
      transparency: {
        provider: provider.config.provider,
        providerLabel: provider.config.label,
        model: provider.config.model,
        requestId: providerResult.requestId,
        workflowVersion: WORKFLOW_VERSION,
        durationMs: Date.now() - started,
        inputTokens: providerResult.usage.inputTokens,
        outputTokens: providerResult.usage.outputTokens,
        sourceTruncated: sourceData.truncated,
        executionLocation: provider.config.provider === "ssh-gateway" ? "سيرفر SSH البعيد" : "مزود API",
        documentsSent: provider.config.provider === "ssh-gateway" ? "الملفات الأصلية والمقتطفات النصية" : "المقتطفات النصية",
        approvalStatus: "في انتظار مراجعة المحامي",
      },
    };
    const stored = await storeEncryptedBlob({ key: outputKey, value: new TextEncoder().encode(JSON.stringify(trace)), userId: user.id, purpose: `workflow-output:${runId}` });
    const completedAt = new Date().toISOString();
    updateRunCompleted(runId, user.id, {
      outputKey,
      outputIv: stored.iv,
      verifiedCitationCount,
      durationMs: Date.now() - started,
      inputTokens: providerResult.usage.inputTokens,
      outputTokens: providerResult.usage.outputTokens,
      completedAt,
    });
    await writeAuditEvent({ userId: user.id, runId, eventType: "workflow.completed", detail: { verifiedCitationCount, durationMs: Date.now() - started } });
    return noStoreJson({ run: { id: runId, status: "completed", toolSlug: input.toolSlug, title: input.title, approvedAt: null, ...trace } }, { status: 201 });
  } catch (error) {
    if (runId) {
      try { updateRunFailed(runId, user.id, Date.now() - started, new Date().toISOString()); } catch { /* best-effort status update */ }
      await writeAuditEvent({ userId: user.id, runId, eventType: "workflow.failed", detail: { durationMs: Date.now() - started } }).catch(() => undefined);
    }
    return apiError(error, 400);
  }
}
