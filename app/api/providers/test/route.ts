import { z } from "zod";
import { callProvider } from "@/lib/ai/providers";
import { isAuthResponse, requireApiUser } from "@/lib/server/auth";
import { loadProviderForUser } from "@/lib/server/storage";
import { apiError } from "@/lib/server/errors";
import { assertSameOrigin, noStoreJson, parseJsonWithLimit } from "@/lib/security";
import { writeAuditEvent } from "@/lib/server/audit";
import { testSshProvider } from "@/lib/server/ssh-workflow";
import { incrementRateLimit } from "@/db/repository";

const testSchema = z.object({ providerId: z.string().uuid() });

export async function POST(request: Request) {
  const user = await requireApiUser();
  if (isAuthResponse(user)) return user;
  try {
    assertSameOrigin(request);
    const input = testSchema.parse(await parseJsonWithLimit(request, 8_000));
    if (incrementRateLimit(user.id, "provider-test-hour", Math.floor(Date.now() / 3600000) * 3600000) > 30) throw new Error("RATE_LIMITED");
    const provider = await loadProviderForUser(user.id, input.providerId);
    const started = Date.now();
    const result = provider.config.provider === "ssh-gateway" ? await testSshProvider(provider.apiKey, request.signal) : await callProvider({
      ...provider,
      systemPrompt: "أجب بكلمة جاهز فقط.",
      userPrompt: "اختبار اتصال.",
      maxOutputTokens: 32,
    });
    await writeAuditEvent({
      userId: user.id,
      eventType: "provider.tested",
      detail: { providerId: input.providerId, success: true, durationMs: Date.now() - started },
    });
    return noStoreJson({ ok: true, durationMs: Date.now() - started, requestId: result.requestId });
  } catch (error) {
    return apiError(error, 400);
  }
}
