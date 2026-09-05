import { z } from "zod";

export const sshSettingsSchema = z.object({
  host: z.string().trim().toLowerCase().min(1).max(253).regex(/^[a-z0-9][a-z0-9.-]*$/),
  port: z.number().int().min(1).max(65535).default(22),
  username: z.string().trim().min(1).max(64).regex(/^[a-zA-Z0-9_][a-zA-Z0-9_.-]*$/),
  privateKey: z.string().trim().min(80).max(16000),
  passphrase: z.string().max(1024).optional(),
  fingerprint: z.string().trim().regex(/^SHA256:[A-Za-z0-9+/]{43}=?$/),
}).strict();

export type SshSettings = z.infer<typeof sshSettingsSchema>;

export function assertSshTargetAllowed(settings: Pick<SshSettings, "host" | "port">): void {
  const allowed = (process.env.ALLOWED_SSH_HOSTS ?? "").split(",").map(value => value.trim().toLowerCase());
  if (!allowed.includes(`${settings.host}:${settings.port}`)) throw new Error("SSH_HOST_DENIED");
}
