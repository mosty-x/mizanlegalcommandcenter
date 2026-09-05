import { listFirmConfigs } from "@/db/repository";
import { decryptText } from "@/lib/server/crypto";

export async function loadFirmConfiguration(userId: string): Promise<Record<string, unknown>> {
  const rows = listFirmConfigs(userId);
  const configs: Record<string, unknown> = {};
  for (const row of rows) {
    const plain = await decryptText(row.ciphertext, row.iv, userId, `config:${row.kind}`);
    configs[row.kind] = JSON.parse(plain) as unknown;
  }
  return configs;
}
