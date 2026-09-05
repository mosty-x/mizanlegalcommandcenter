import { deleteProvider, insertProvider, listProviders } from "@/db/repository";
import { providerInputSchema, resolveProviderUrl } from "@/lib/ai/providers";
import { encryptText } from "@/lib/server/crypto";
import { apiError } from "@/lib/server/errors";
import { isAuthResponse, requireApiUser } from "@/lib/server/auth";
import { assertSameOrigin, noStoreJson, parseJsonWithLimit, safeIdentifierSchema } from "@/lib/security";
import { writeAuditEvent } from "@/lib/server/audit";
import { validateSshCredentials } from "@/lib/server/ssh-transport";

export async function GET() {
  const user = await requireApiUser();
  if (isAuthResponse(user)) return user;
  try {
    const rows = listProviders(user.id).map(({ id, label, provider, model, baseUrl, createdAt }) => ({ id, label, provider, model, baseUrl, createdAt }));
    return noStoreJson({ providers: rows });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  const user = await requireApiUser();
  if (isAuthResponse(user)) return user;
  try {
    assertSameOrigin(request);
    const input = providerInputSchema.parse(await parseJsonWithLimit(request, 32_000));
    const ssh = input.provider === "ssh-gateway" ? validateSshCredentials(input.ssh) : null;
    const baseUrl = input.provider === "ssh-gateway" ? `ssh://${ssh!.host}:${ssh!.port}` : resolveProviderUrl(input.provider, input.baseUrl);
    const id = crypto.randomUUID();
    const encrypted = await encryptText(input.provider === "ssh-gateway" ? JSON.stringify(ssh) : input.apiKey, user.id, `provider:${id}`);
    const now = new Date().toISOString();
    insertProvider({
      id,
      userId: user.id,
      label: input.label,
      provider: input.provider,
      model: input.model,
      baseUrl,
      apiKeyCiphertext: encrypted.ciphertext,
      apiKeyIv: encrypted.iv,
      createdAt: now,
      updatedAt: now,
    });
    await writeAuditEvent({
      userId: user.id,
      eventType: "provider.created",
      detail: { providerId: id, provider: input.provider, model: input.model },
    });
    return noStoreJson(
      { provider: { id, label: input.label, provider: input.provider, model: input.model, baseUrl } },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error, 400);
  }
}

export async function DELETE(request: Request) {
  const user = await requireApiUser();
  if (isAuthResponse(user)) return user;
  try {
    assertSameOrigin(request);
    const id = safeIdentifierSchema.parse(new URL(request.url).searchParams.get("id"));
    if (!deleteProvider(user.id, id)) throw new Error("PROVIDER_NOT_FOUND");
    await writeAuditEvent({ userId: user.id, eventType: "provider.deleted", detail: { providerId: id } });
    return noStoreJson({ ok: true });
  } catch (error) {
    return apiError(error, 400);
  }
}
