import { createHash, generateKeyPairSync } from "node:crypto";
import ssh2 from "ssh2";
const { Server, utils } = ssh2;

export async function startSshFixture() {
  // ssh2 expects OpenSSH or classic PEM; use RSA PKCS1 for portable fixture keys.
  const serverKey = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs1", format: "pem" });
  const userKey = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs1", format: "pem" });
  const parsedUser = utils.parseKey(userKey);
  const clients = new Set();
  const packets = [];
  const commands = [];
  const fixture = { mode: "valid", packets, commands, authCount: 0 };
  const server = new Server({ hostKeys: [serverKey] }, client => {
    clients.add(client);
    client.on("error", () => {});
    client.on("close", () => clients.delete(client));
    client.on("authentication", ctx => {
      if (ctx.method !== "publickey" || ctx.username !== "mizan" || !ctx.key.data.equals(parsedUser.getPublicSSH())) return ctx.reject();
      if (ctx.signature && !parsedUser.verify(ctx.blob, ctx.signature, ctx.hashAlgo)) return ctx.reject();
      fixture.authCount++;
      ctx.accept();
    });
    client.on("ready", () => client.on("session", accept => {
      const session = accept();
      session.on("exec", (acceptExec, reject, info) => {
        commands.push(info.command);
        if (info.command !== "/usr/local/bin/mizan-workflow --stdio") return reject();
        const stream = acceptExec();
        let raw = "";
        stream.on("error", () => {});
        stream.on("data", data => { raw += data.toString(); });
        stream.on("end", () => {
          let packet;
          try { packet = JSON.parse(raw); } catch { stream.end(); return; }
          packets.push(packet);
          if (fixture.mode === "timeout") return;
          if (fixture.mode === "disconnect") { client.end(); return; }
          if (fixture.mode === "oversize") { stream.write("x".repeat(1500010)); stream.exit(0); stream.end(); return; }
          if (fixture.mode === "invalid") { stream.write("not json"); stream.exit(0); stream.end(); return; }
          const response = { protocol: packet.protocol, requestId: fixture.mode === "wrong-id" ? "wrong" : packet.requestId, ok: true };
          if (packet.operation === "health") response.ready = true;
          else response.output = {
            title: "نتيجة اختبار اتصال فقط", executiveSummary: "بيانات اصطناعية لاختبار مسار التشغيل",
            findings: [{ title: "واقعة اختبار", category: "وقائع", severity: "معلومة", explanation: "اختبار",
              recommendation: "مراجعة", sourceRefs: [packet.sources[0].id, "UNKNOWN-SOURCE"], confidence: 50 }],
            missingInformation: [], recommendedActions: [], assumptions: [], humanDecisionRequired: ["المراجعة"], disclaimer: "اختبار تقني فقط",
          };
          stream.write(JSON.stringify(response)); stream.exit(0); stream.end();
        });
      });
    }));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  return { ...fixture, get mode() { return fixture.mode; }, set mode(value) { fixture.mode = value; },
    get authCount() { return fixture.authCount; },
    settings: { host: "127.0.0.1", port, username: "mizan", privateKey: userKey,
      fingerprint: `SHA256:${createHash("sha256").update(utils.parseKey(serverKey).getPublicSSH()).digest("base64").replace(/=+$/, "")}` },
    close: async () => { for (const client of clients) client.end(); await new Promise(resolve => server.close(resolve)); },
  };
}
