// Optional real reference implementation. Replace this module with your workflow engine.
// The reference performs the same single analysis call as the original app, on this server.
function profile(config, name) {
  if (!Object.hasOwn(config.profiles ?? {}, name)) throw new Error("PROFILE_NOT_FOUND");
  const value = config.profiles[name];
  const url = new URL(value.endpoint);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname))) throw new Error("ENDPOINT_INVALID");
  if (!value.model || url.username || url.password) throw new Error("PROFILE_INVALID");
  return { ...value, url };
}

export async function health(config) {
  const names = Object.keys(config.profiles ?? {});
  if (!names.length) return false;
  for (const name of names) profile(config, name);
  // Readiness validates installed handler/config; it does not bill a model inference.
  return true;
}

export async function run(packet, config) {
  const selected = profile(config, packet.workflow.profile);
  const response = await fetch(selected.url, {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(75000),
    headers: { "content-type": "application/json", ...(selected.apiKey ? { authorization: `Bearer ${selected.apiKey}` } : {}) },
    body: JSON.stringify({ model: selected.model, temperature: 0.1, max_tokens: 4096,
      response_format: { type: "json_object" }, messages: [
        { role: "system", content: packet.prompt.systemPrompt },
        { role: "user", content: packet.prompt.userPrompt },
      ] }),
  });
  if (!response.ok) throw new Error("PROVIDER_FAILED");
  let size = 0;
  const chunks = [];
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > 1500000) throw new Error("OUTPUT_TOO_LARGE");
    chunks.push(chunk);
  }
  const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  return { output: JSON.parse(body.choices[0].message.content), usage: {
    inputTokens: body.usage?.prompt_tokens ?? null,
    outputTokens: body.usage?.completion_tokens ?? null,
  } };
}
