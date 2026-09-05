import { z } from "zod";
import { TOOL_SLUGS } from "@/lib/security";

export const configKindSchema = z.enum([
  "firm-profile",
  "provider-catalog",
  "practice-policy",
  "source-registry",
  "workflow-config",
]);

const firmProfileSchema = z.object({
  firmName: z.string().trim().min(2).max(140),
  shortName: z.string().trim().min(1).max(20),
  locale: z.literal("ar-EG").default("ar-EG"),
  branches: z.array(z.string().trim().min(2).max(120)).max(20).default([]),
  contactEmail: z.string().email().optional(),
});

const providerCatalogSchema = z.object({
  allowedProviders: z
    .array(z.enum(["openai", "anthropic", "gemini", "openai-compatible", "ssh-gateway"]))
    .min(1)
    .max(10),
  approvedModels: z.array(z.string().trim().min(2).max(120)).max(100).default([]),
});

const practicePolicySchema = z.object({
  requireHumanApproval: z.literal(true),
  allowExternalActions: z.literal(false),
  retentionDays: z.number().int().min(1).max(3650).default(365),
  permittedJurisdictions: z.array(z.string().trim().min(2).max(100)).max(50).default([]),
  prohibitedDataCategories: z.array(z.string().trim().min(2).max(120)).max(50).default([]),
});

const sourceRegistrySchema = z.object({
  sources: z
    .array(
      z.object({
        name: z.string().trim().min(2).max(160),
        url: z.string().url().max(500),
        authority: z.number().int().min(1).max(5),
        jurisdiction: z.string().trim().min(2).max(100),
      }),
    )
    .max(300),
});

const workflowConfigSchema = z.object({
  enabledTools: z.array(z.enum(TOOL_SLUGS)).min(1).max(5),
  maxDocumentsPerRun: z.number().int().min(1).max(8).default(8),
  maxFindings: z.number().int().min(1).max(60).default(30),
  requireVerifiedSources: z.literal(true),
});

export const CONFIG_SCHEMAS = {
  "firm-profile": firmProfileSchema,
  "provider-catalog": providerCatalogSchema,
  "practice-policy": practicePolicySchema,
  "source-registry": sourceRegistrySchema,
  "workflow-config": workflowConfigSchema,
} as const;

export function validateConfig(kind: z.infer<typeof configKindSchema>, data: unknown): unknown {
  return CONFIG_SCHEMAS[kind].parse(data);
}
