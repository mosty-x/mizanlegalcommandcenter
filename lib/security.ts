import { z } from "zod";

export const TOOL_SLUGS = [
  "enforceability",
  "disputes",
  "deal-room",
  "regulatory",
  "client-command",
] as const;

export const toolSlugSchema = z.enum(TOOL_SLUGS);

export const safeIdentifierSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-zA-Z0-9_-]+$/);

export function sanitizeFileName(value: string): string {
  const normalized = value.normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, "");
  const base = normalized.split(/[\\/]/).pop() ?? "document";
  const safe = base.replace(/[^\p{L}\p{N}._ -]/gu, "_").trim();
  return (safe || "document").slice(0, 160);
}

export function noStoreJson(
  body: unknown,
  init: ResponseInit & { status?: number } = {},
): Response {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store, max-age=0");
  headers.set("X-Content-Type-Options", "nosniff");
  return Response.json(body, { ...init, headers });
}

export async function parseJsonWithLimit(request: Request, maxBytes = 256_000): Promise<unknown> {
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > maxBytes) throw new Error("PAYLOAD_TOO_LARGE");
  const raw = await request.text();
  if (raw.length > maxBytes) throw new Error("PAYLOAD_TOO_LARGE");
  return JSON.parse(raw);
}

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) return;
  const requestUrl = new URL(request.url);
  const originUrl = new URL(origin);
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const expectedHost = forwardedHost || request.headers.get("host") || requestUrl.host;
  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const expectedProtocol = forwardedProtocol ? `${forwardedProtocol}:` : requestUrl.protocol;
  if (originUrl.protocol !== expectedProtocol || originUrl.host !== expectedHost) {
    throw new Error("ORIGIN_DENIED");
  }
}

const DEFAULT_ALLOWED_AI_HOSTS = [
  "api.openai.com",
  "api.anthropic.com",
  "generativelanguage.googleapis.com",
  "api.groq.com",
  "openrouter.ai",
  "api.mistral.ai",
  "api.x.ai",
];

export function validateProviderUrl(rawUrl: string, extraHosts = ""): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("PROVIDER_URL_INVALID");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) {
    throw new Error("PROVIDER_URL_INVALID");
  }
  const allowed = new Set([
    ...DEFAULT_ALLOWED_AI_HOSTS,
    ...extraHosts.split(",").map((host) => host.trim().toLowerCase()).filter(Boolean),
  ]);
  if (!allowed.has(url.hostname.toLowerCase())) throw new Error("PROVIDER_HOST_DENIED");
  return url;
}

export function safeErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : "UNEXPECTED_ERROR";
  const allowed = new Set([
    "SSH_HOST_DENIED", "SSH_KEY_INVALID", "SSH_BUSY", "SSH_TIMEOUT",
    "SSH_FINGERPRINT_MISMATCH", "SSH_CONNECTION_FAILED", "SSH_CONNECTION_CLOSED",
    "SSH_EXEC_FAILED", "SSH_PROTOCOL_INVALID",
    "PAYLOAD_TOO_LARGE",
    "PROVIDER_URL_INVALID",
    "PROVIDER_HOST_DENIED",
    "PROVIDER_NOT_FOUND",
    "PROVIDER_RESPONSE_INVALID",
    "PROVIDER_RESPONSE_TOO_LARGE",
    "PROVIDER_TIMEOUT",
    "MASTER_KEY_UNAVAILABLE",
    "MASTER_KEY_INVALID",
    "STORAGE_UNAVAILABLE",
    "DOCUMENT_NOT_FOUND",
    "DOCUMENT_TYPE_DENIED",
    "DOCUMENT_SIGNATURE_INVALID",
    "DOCUMENT_TEXT_EMPTY",
    "DOCUMENT_LIMIT_REACHED",
    "WORKFLOW_NOT_FOUND",
    "WORKFLOW_OUTPUT_UNAVAILABLE",
    "TOOL_NOT_FOUND",
    "RATE_LIMITED",
    "ORIGIN_DENIED",
    "CONFIG_POLICY_DENIED",
  ]);
  return allowed.has(message) ? message : "UNEXPECTED_ERROR";
}
