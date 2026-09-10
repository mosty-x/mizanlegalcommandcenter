import { z } from "zod";
import { deleteDocument, findDocument, insertDocument, listDocuments } from "@/db/repository";
import { apiError } from "@/lib/server/errors";
import { isAuthResponse, requireApiUser } from "@/lib/server/auth";
import { requireBucket } from "@/lib/server/runtime";
import { storeEncryptedBlob } from "@/lib/server/storage";
import { sha256Hex } from "@/lib/server/crypto";
import {
  assertSameOrigin,
  noStoreJson,
  parseJsonWithLimit,
  safeIdentifierSchema,
  sanitizeFileName,
  toolSlugSchema,
} from "@/lib/security";
import { writeAuditEvent } from "@/lib/server/audit";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TEXT_CHARS = 220_000;
const uploadSchema = z.object({
  toolSlug: toolSlugSchema,
  fileName: z.string().min(1).max(300),
  mimeType: z.string().min(1).max(120),
  base64: z.string().min(4).max(14_200_000),
  extractedText: z.string().min(1).max(MAX_TEXT_CHARS),
});

const ALLOWED_EXTENSIONS = new Set(["pdf", "docx", "txt", "md", "csv", "json"]);
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
  "application/octet-stream",
]);

function decodeBase64(value: string): Uint8Array {
  let binary: string;
  try {
    binary = atob(value);
  } catch {
    throw new Error("DOCUMENT_SIGNATURE_INVALID");
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function validateDocumentSignature(fileName: string, mimeType: string, bytes: Uint8Array) {
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED_EXTENSIONS.has(extension) || !ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new Error("DOCUMENT_TYPE_DENIED");
  }
  if (extension === "pdf" && !(bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46)) {
    throw new Error("DOCUMENT_SIGNATURE_INVALID");
  }
  if (extension === "docx" && !(bytes[0] === 0x50 && bytes[1] === 0x4b)) {
    throw new Error("DOCUMENT_SIGNATURE_INVALID");
  }
}

export async function GET(request: Request) {
  const user = await requireApiUser();
  if (isAuthResponse(user)) return user;
  try {
    const rawTool = new URL(request.url).searchParams.get("tool");
    const toolSlug = rawTool ? toolSlugSchema.parse(rawTool) : null;
    const rows = listDocuments(user.id, toolSlug).map(({ id, toolSlug, fileName, mimeType, sizeBytes, sha256, createdAt }) => ({ id, toolSlug, fileName, mimeType, sizeBytes, sha256, createdAt }));
    return noStoreJson({ documents: rows });
  } catch (error) {
    return apiError(error, 400);
  }
}

export async function POST(request: Request) {
  const user = await requireApiUser();
  if (isAuthResponse(user)) return user;
  let storedKeys: string[] = [];
  try {
    assertSameOrigin(request);
    const input = uploadSchema.parse(await parseJsonWithLimit(request, 15_500_000));
    const fileName = sanitizeFileName(input.fileName);
    const bytes = decodeBase64(input.base64);
    if (bytes.byteLength > MAX_FILE_BYTES) throw new Error("PAYLOAD_TOO_LARGE");
    validateDocumentSignature(fileName, input.mimeType, bytes);
    const id = crypto.randomUUID();
    const blobKey = `${user.id}/documents/${id}/original.bin`;
    const textKey = `${user.id}/documents/${id}/text.bin`;
    storedKeys = [blobKey, textKey];
    const blob = await storeEncryptedBlob({ key: blobKey, value: bytes, userId: user.id, purpose: `document-blob:${id}` });
    const text = await storeEncryptedBlob({
      key: textKey,
      value: new TextEncoder().encode(input.extractedText.replace(/\u0000/g, "").slice(0, MAX_TEXT_CHARS)),
      userId: user.id,
      purpose: `document-text:${id}`,
    });
    const now = new Date().toISOString();
    const hash = await sha256Hex(bytes);
    insertDocument({
      id,
      userId: user.id,
      toolSlug: input.toolSlug,
      fileName,
      mimeType: input.mimeType,
      sizeBytes: bytes.byteLength,
      sha256: hash,
      blobKey,
      blobIv: blob.iv,
      textKey,
      textIv: text.iv,
      createdAt: now,
    });
    await writeAuditEvent({
      userId: user.id,
      eventType: "document.uploaded",
      detail: { documentId: id, toolSlug: input.toolSlug, sizeBytes: bytes.byteLength, sha256: hash },
    });
    return noStoreJson({ document: { id, toolSlug: input.toolSlug, fileName, mimeType: input.mimeType, sizeBytes: bytes.byteLength, sha256: hash, createdAt: now } }, { status: 201 });
  } catch (error) {
    if (storedKeys.length) {
      try { await requireBucket().delete(storedKeys); } catch { /* best-effort rollback */ }
    }
    return apiError(error, 400);
  }
}

export async function DELETE(request: Request) {
  const user = await requireApiUser();
  if (isAuthResponse(user)) return user;
  try {
    assertSameOrigin(request);
    const id = safeIdentifierSchema.parse(new URL(request.url).searchParams.get("id"));
    const row = findDocument(user.id, id);
    if (!row) throw new Error("DOCUMENT_NOT_FOUND");
    await requireBucket().delete([row.blobKey, row.textKey]);
    deleteDocument(user.id, id);
    await writeAuditEvent({ userId: user.id, eventType: "document.deleted", detail: { documentId: id } });
    return noStoreJson({ ok: true });
  } catch (error) {
    return apiError(error, 400);
  }
}
