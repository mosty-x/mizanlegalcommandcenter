import { insertAuditEvent } from "@/db/repository";

export async function writeAuditEvent(args: {
  userId: string;
  runId?: string;
  eventType: string;
  detail?: Record<string, string | number | boolean | null>;
}): Promise<void> {
  insertAuditEvent({
    id: crypto.randomUUID(),
    userId: args.userId,
    runId: args.runId ?? null,
    eventType: args.eventType.slice(0, 80),
    detail: JSON.stringify(args.detail ?? {}),
    createdAt: new Date().toISOString(),
  });
}
