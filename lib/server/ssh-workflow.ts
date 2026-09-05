import { z } from "zod";
import { findDocuments } from "@/db/repository";
import { decryptBytes } from "./crypto";
import { requireBucket } from "./runtime";
import { sshExchange, SSH_PROTOCOL, validateSshCredentials } from "./ssh-transport";
import { workflowOutputSchema, type SourceChunk } from "@/lib/workflows";
import type { ProviderResult } from "@/lib/ai/providers";

export async function testSshProvider(secret: string, signal?: AbortSignal) {
  const requestId = crypto.randomUUID();
  await sshExchange({ settings: validateSshCredentials(JSON.parse(secret)), packet: {
    protocol: SSH_PROTOCOL, requestId, operation: "health",
  }, signal, timeoutMs: 20000 });
  return { requestId };
}

const usageSchema = z.object({
  inputTokens: z.number().int().nonnegative().nullable().default(null),
  outputTokens: z.number().int().nonnegative().nullable().default(null),
}).default({ inputTokens: null, outputTokens: null });

export async function runSshWorkflow(args: {
  userId: string; secret: string; runId: string; profile: string;
  toolSlug: string; title: string; objective: string; jurisdiction: string;
  documentIds: string[]; sources: SourceChunk[]; sourceTruncated: boolean;
  customization: Record<string, unknown>;
  prompt: { systemPrompt: string; userPrompt: string };
  signal?: AbortSignal;
}): Promise<ProviderResult> {
  const rows = findDocuments(args.userId, Array.from(new Set(args.documentIds)));
  if (rows.length !== new Set(args.documentIds).size) throw new Error("DOCUMENT_NOT_FOUND");
  const documents = [];
  for (const row of rows) {
    const stored = await requireBucket().get(row.blobKey);
    if (!stored) throw new Error("DOCUMENT_NOT_FOUND");
    const bytes = await decryptBytes(await stored.arrayBuffer(), row.blobIv, args.userId, `document-blob:${row.id}`);
    documents.push({ id: row.id, fileName: row.fileName, mimeType: row.mimeType,
      sha256: row.sha256, sizeBytes: row.sizeBytes, base64: Buffer.from(bytes).toString("base64") });
  }
  const response = await sshExchange({
    settings: validateSshCredentials(JSON.parse(args.secret)), signal: args.signal,
    packet: {
      protocol: SSH_PROTOCOL, operation: "run", requestId: args.runId,
      workflow: { version: "1.1.0", toolSlug: args.toolSlug, profile: args.profile,
        title: args.title, objective: args.objective, jurisdiction: args.jurisdiction },
      documents, sources: args.sources, sourceTruncated: args.sourceTruncated,
      customization: args.customization, prompt: args.prompt,
      policy: { humanApprovalRequired: true, externalActionsAllowed: false },
    },
  });
  const output = workflowOutputSchema.parse(response.output);
  const usage = usageSchema.parse(response.usage);
  return { text: JSON.stringify(output), requestId: args.runId, usage };
}
