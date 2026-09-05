import { z } from "zod";
import { getRuntimeEnvironment } from "@/lib/server/runtime";
import { validateProviderUrl } from "@/lib/security";
import { sshSettingsSchema } from "./ssh-settings";

export const providerTypeSchema = z.enum([
  "openai",
  "anthropic",
  "gemini",
  "openai-compatible",
  "ssh-gateway",
]);

export type ProviderType = z.infer<typeof providerTypeSchema>;

const apiProviderInputSchema = z.object({
  label: z.string().trim().min(2).max(80),
  provider: z.enum(["openai", "anthropic", "gemini", "openai-compatible"]),
  model: z.string().trim().min(2).max(120),
  baseUrl: z.string().trim().url().max(300).optional(),
  apiKey: z.string().trim().min(8).max(1_000),
});
export const providerInputSchema = z.union([apiProviderInputSchema, z.object({
  label: z.string().trim().min(2).max(80),
  provider: z.literal("ssh-gateway"),
  model: z.string().trim().min(2).max(120),
  ssh: sshSettingsSchema,
}).strict()]);

export type StoredProvider = {
  id: string;
  label: string;
  provider: ProviderType;
  model: string;
  baseUrl: string;
};

export type ProviderUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
};

export type ProviderResult = {
  text: string;
  usage: ProviderUsage;
  requestId: string | null;
};

const DEFAULT_URLS: Record<Exclude<ProviderType, "openai-compatible" | "ssh-gateway">, string> = {
  openai: "https://api.openai.com/v1/chat/completions",
  anthropic: "https://api.anthropic.com/v1/messages",
  gemini: "https://generativelanguage.googleapis.com/v1beta",
};

export function resolveProviderUrl(
  provider: Exclude<ProviderType, "ssh-gateway">,
  baseUrl?: string,
): string {
  const url = provider === "openai-compatible" ? baseUrl : DEFAULT_URLS[provider];
  if (!url) throw new Error("PROVIDER_URL_INVALID");
  return validateProviderUrl(url, getRuntimeEnvironment().ALLOWED_AI_HOSTS).toString();
}

async function readLimitedResponse(response: Response): Promise<unknown> {
  const contentLength = Number(response.headers.get("content-length") ?? "0");
  if (contentLength > 1_500_000) throw new Error("PROVIDER_RESPONSE_TOO_LARGE");
  const raw = await response.text();
  if (raw.length > 1_500_000) throw new Error("PROVIDER_RESPONSE_TOO_LARGE");
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new Error("PROVIDER_RESPONSE_INVALID");
  }
  if (!response.ok) {
    const status = response.status;
    if (status === 408 || status === 504) throw new Error("PROVIDER_TIMEOUT");
    throw new Error(`PROVIDER_HTTP_${status}`);
  }
  return body;
}

export async function callProvider(args: {
  config: StoredProvider;
  apiKey: string;
  systemPrompt: string;
  userPrompt: string;
  maxOutputTokens?: number;
}): Promise<ProviderResult> {
  const { config, apiKey, systemPrompt, userPrompt } = args;
  if (config.provider === "ssh-gateway") throw new Error("SSH_PROTOCOL_INVALID");
  const maxOutputTokens = Math.min(Math.max(args.maxOutputTokens ?? 3_200, 256), 4_096);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);

  try {
    if (config.provider === "anthropic") {
      const url = validateProviderUrl(
        config.baseUrl,
        getRuntimeEnvironment().ALLOWED_AI_HOSTS,
      );
      const response = await fetch(url, {
        method: "POST",
        redirect: "error",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: config.model,
          max_tokens: maxOutputTokens,
          temperature: 0.1,
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
        }),
      });
      const body = (await readLimitedResponse(response)) as {
        id?: string;
        content?: Array<{ type?: string; text?: string }>;
        usage?: { input_tokens?: number; output_tokens?: number };
      };
      const text = body.content?.find((part) => part.type === "text")?.text;
      if (!text) throw new Error("PROVIDER_RESPONSE_INVALID");
      return {
        text,
        requestId: body.id ?? response.headers.get("request-id"),
        usage: {
          inputTokens: body.usage?.input_tokens ?? null,
          outputTokens: body.usage?.output_tokens ?? null,
        },
      };
    }

    if (config.provider === "gemini") {
      const root = validateProviderUrl(
        config.baseUrl,
        getRuntimeEnvironment().ALLOWED_AI_HOSTS,
      );
      const url = new URL(
        `${root.pathname.replace(/\/$/, "")}/models/${encodeURIComponent(config.model)}:generateContent`,
        root.origin,
      );
      const response = await fetch(url, {
        method: "POST",
        redirect: "error",
        signal: controller.signal,
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: "user", parts: [{ text: userPrompt }] }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens,
            responseMimeType: "application/json",
          },
        }),
      });
      const body = (await readLimitedResponse(response)) as {
        responseId?: string;
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
      };
      const text = body.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("");
      if (!text) throw new Error("PROVIDER_RESPONSE_INVALID");
      return {
        text,
        requestId: body.responseId ?? null,
        usage: {
          inputTokens: body.usageMetadata?.promptTokenCount ?? null,
          outputTokens: body.usageMetadata?.candidatesTokenCount ?? null,
        },
      };
    }

    const url = validateProviderUrl(
      config.baseUrl,
      getRuntimeEnvironment().ALLOWED_AI_HOSTS,
    );
    const response = await fetch(url, {
      method: "POST",
      redirect: "error",
      signal: controller.signal,
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.1,
        max_tokens: maxOutputTokens,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });
    const body = (await readLimitedResponse(response)) as {
      id?: string;
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const text = body.choices?.[0]?.message?.content;
    if (!text) throw new Error("PROVIDER_RESPONSE_INVALID");
    return {
      text,
      requestId: body.id ?? response.headers.get("x-request-id"),
      usage: {
        inputTokens: body.usage?.prompt_tokens ?? null,
        outputTokens: body.usage?.completion_tokens ?? null,
      },
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("PROVIDER_TIMEOUT");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
