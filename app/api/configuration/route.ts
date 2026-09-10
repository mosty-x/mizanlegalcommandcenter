import { z } from "zod";
import { listFirmConfigs, upsertFirmConfig } from "@/db/repository";
import { configKindSchema, validateConfig } from "@/lib/config-schemas";
import { decryptText, encryptText } from "@/lib/server/crypto";
import { isAuthResponse, requireApiUser } from "@/lib/server/auth";
import { assertSameOrigin, noStoreJson, parseJsonWithLimit } from "@/lib/security";
import { apiError } from "@/lib/server/errors";
import { writeAuditEvent } from "@/lib/server/audit";

const requestSchema = z.object({ kind: configKindSchema, data: z.unknown() });

export async function GET() {
  const user = await requireApiUser();
  if (isAuthResponse(user)) return user;
  try {
    const rows = listFirmConfigs(user.id);
    const configs: Record<string, unknown> = {};
    for (const row of rows) {
      const plain = await decryptText(row.ciphertext, row.iv, user.id, `config:${row.kind}`);
      configs[row.kind] = JSON.parse(plain);
    }
    return noStoreJson({ configs });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  const user = await requireApiUser();
  if (isAuthResponse(user)) return user;
  try {
    assertSameOrigin(request);
    const payload = requestSchema.parse(await parseJsonWithLimit(request, 300_000));
    const validated = validateConfig(payload.kind, payload.data);
    const encrypted = await encryptText(
      JSON.stringify(validated),
      user.id,
      `config:${payload.kind}`,
    );
    const now = new Date().toISOString();
    upsertFirmConfig(user.id, payload.kind, encrypted.ciphertext, encrypted.iv, now);
    await writeAuditEvent({
      userId: user.id,
      eventType: "configuration.updated",
      detail: { kind: payload.kind },
    });
    return noStoreJson({ ok: true, kind: payload.kind, data: validated });
  } catch (error) {
    return apiError(error, 400);
  }
}
