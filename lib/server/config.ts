import { listFirmConfigs } from "@/db/repository";
import { decryptText } from "@/lib/server/crypto";
import { digest } from "@/lib/rag/retrieval";

export function configurationRevisionNow(userId: string): string {
  return digest(listFirmConfigs(userId).sort((a,b)=>a.kind.localeCompare(b.kind)));
}

export async function loadFirmConfiguration(userId: string): Promise<Record<string, unknown>> {
  const rows = listFirmConfigs(userId);
  const configs: Record<string, unknown> = {};
  for (const row of rows) {
    const plain = await decryptText(row.ciphertext, row.iv, userId, `config:${row.kind}`);
    configs[row.kind] = JSON.parse(plain) as unknown;
  }
  return configs;
}
