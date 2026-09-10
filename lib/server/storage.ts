import { findDocuments, findProvider } from "@/db/repository";
import { decryptBytes, decryptText, encryptBytes } from "@/lib/server/crypto";
import { requireBucket } from "@/lib/server/runtime";
import type { StoredProvider } from "@/lib/ai/providers";
import { chunkDocument, type SourceChunk } from "@/lib/workflows";

export async function loadProviderForUser(
  userId: string,
  providerId: string,
): Promise<{ config: StoredProvider; apiKey: string }> {
  const row = findProvider(userId, providerId);
  if (!row) throw new Error("PROVIDER_NOT_FOUND");
  const apiKey = await decryptText(
    row.apiKeyCiphertext,
    row.apiKeyIv,
    userId,
    `provider:${row.id}`,
  );
  return {
    config: {
      id: row.id,
      label: row.label,
      provider: row.provider as StoredProvider["provider"],
      model: row.model,
      baseUrl: row.baseUrl,
    },
    apiKey,
  };
}

export async function loadDocumentChunks(
  userId: string,
  documentIds: string[],
): Promise<{ chunks: SourceChunk[]; truncated: boolean }> {
  const uniqueIds = Array.from(new Set(documentIds)).slice(0, 8);
  if (!uniqueIds.length) throw new Error("DOCUMENT_NOT_FOUND");
  const rows = findDocuments(userId, uniqueIds);
  if (rows.length !== uniqueIds.length) throw new Error("DOCUMENT_NOT_FOUND");

  const bucket = requireBucket();
  const allChunks: SourceChunk[] = [];
  let totalChars = 0;
  let truncated = false;

  for (const row of rows) {
    const stored = await bucket.get(row.textKey);
    if (!stored) throw new Error("DOCUMENT_NOT_FOUND");
    const plain = await decryptBytes(
      await stored.arrayBuffer(),
      row.textIv,
      userId,
      `document-text:${row.id}`,
    );
    const text = new TextDecoder().decode(plain);
    for (const chunk of chunkDocument({ documentId: row.id, fileName: row.fileName, text })) {
      if (totalChars + chunk.text.length > 140_000 || allChunks.length >= 42) {
        truncated = true;
        break;
      }
      allChunks.push(chunk);
      totalChars += chunk.text.length;
    }
    if (truncated) break;
  }
  if (!allChunks.length) throw new Error("DOCUMENT_TEXT_EMPTY");
  return { chunks: allChunks, truncated };
}

export async function storeEncryptedBlob(args: {
  key: string;
  value: Uint8Array;
  userId: string;
  purpose: string;
}): Promise<{ iv: string }> {
  const encrypted = await encryptBytes(args.value, args.userId, args.purpose);
  await requireBucket().put(args.key, encrypted.ciphertext, {
    httpMetadata: { contentType: "application/octet-stream" },
    customMetadata: { encrypted: "aes-256-gcm", version: "1" },
  });
  return { iv: encrypted.iv };
}
