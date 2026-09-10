import { z } from "zod";
import { safeIdentifierSchema, toolSlugSchema } from "@/lib/security";

export const RAG_VERSION = "egypt-rag-2.1.0";
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => {
  const d = new Date(`${v}T00:00:00Z`); return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
}, "تاريخ غير صالح");
export const topics = ["contracts", "civil", "arbitration", "litigation", "corporate", "investment", "financial", "regulatory", "client-service"] as const;
export const legalUnitSchema = z.object({
  id: safeIdentifierSchema,
  sourceId: safeIdentifierSchema,
  sourceUrl: z.string().url().max(1200),
  title: z.string().trim().min(3).max(240),
  instrumentId: z.string().trim().min(2).max(140),
  unitLabel: z.string().trim().min(1).max(120),
  kind: z.enum(["legislation", "judgment", "procedure", "arbitration-rule", "commentary"]),
  jurisdiction: z.literal("EG"),
  framework: z.enum(["EG", "CRCICA-2024", "CRCICA-2011"]),
  topics: z.array(z.enum(topics)).min(1).max(9),
  tools: z.array(toolSlugSchema).min(1).max(5),
  text: z.string().trim().min(30).max(5000),
  publishedOn: isoDate,
  validFrom: isoDate,
  validTo: isoDate.nullable(),
  verifiedOn: isoDate,
  reviewer: z.string().trim().min(2).max(100),
  rightsConfirmed: z.literal(true),
  approved: z.literal(true),
}).strict().superRefine((v, ctx) => {
  if (v.validTo && v.validTo <= v.validFrom) ctx.addIssue({code:"custom",message:"نهاية السريان لازم تكون بعد البداية"});
  if (v.verifiedOn < v.publishedOn) ctx.addIssue({code:"custom",message:"المراجعة لا تسبق النشر"});
});
export type LegalUnit = z.infer<typeof legalUnitSchema>;
export const corpusImportSchema = z.object({ units: z.array(legalUnitSchema).min(1).max(200) }).strict();
export const ragPolicySchema = z.object({
  sourceIds: z.array(safeIdentifierSchema).min(1).max(16),
  sourcesUsedByOffice: z.literal(true),
  embeddingProviderId: safeIdentifierSchema,
  rerankProviderId: safeIdentifierSchema,
  verifierProviderId: safeIdentifierSchema,
  topK: z.number().int().min(2).max(16).default(8),
  candidateK: z.number().int().min(8).max(60).default(30),
  minRerankScore: z.number().min(0).max(1).default(0.5),
  maxSourceAgeDays: z.number().int().min(1).max(365).default(90),
  maxItems: z.number().int().min(1).max(16).default(8),
  kvBackend: z.enum(["provider-managed", "vllm"]).default("provider-managed"),
}).strict().refine(v => v.candidateK >= v.topK, "عدد المرشحين لازم يكون أكبر من النتائج النهائية");
export type RagPolicy = z.infer<typeof ragPolicySchema>;
export type ToolSlug = z.infer<typeof toolSlugSchema>;

export type Evidence = {
  id: string; text: string; kind: "matter" | "law";
  documentId?: string; fileName: string; page?: number;
  legal?: LegalUnit; score?: number;
};
export const citationSchema = z.object({sourceId:z.string().min(1).max(160),quote:z.string().min(12).max(1800)}).strict();
export type Citation = z.infer<typeof citationSchema>;
export const factSchema = z.object({
  id: safeIdentifierSchema, text:z.string().min(2).max(1000),
  kind:z.string().min(2).max(60), date:isoDate.nullable(),
  citations:z.array(citationSchema).min(1).max(4),
}).strict();
export type Fact = z.infer<typeof factSchema>;
export const extractionSchema = z.object({facts:z.array(factSchema).max(24)}).strict();
export const claimSchema = z.object({
  id:safeIdentifierSchema, title:z.string().min(2).max(200),
  kind:z.string().min(2).max(60), basis:z.enum(["fact","legal"]),
  statement:z.string().min(3).max(1600), proposal:z.string().max(1000),
  severity:z.enum(["منخفض","متوسط","مرتفع","حرج","معلومة"]),
  factCitations:z.array(citationSchema).max(5), lawCitations:z.array(citationSchema).max(5),
  date:isoDate.nullable(), owner:z.string().max(100).nullable(),
  status:z.enum(["observed","proposed","unknown"]),
  dependsOn:z.array(safeIdentifierSchema).max(12),
}).strict();
export type Claim = z.infer<typeof claimSchema>;
export const draftSchema = z.object({claims:z.array(claimSchema).max(16)}).strict();
export const verificationSchema = z.object({verdicts:z.array(z.object({
  claimId:safeIdentifierSchema,
  verdict:z.enum(["supported","unsupported","uncertain"]),
}).strict()).max(16)}).strict();
export type NodeTrace = {id:string;label:string;status:"running"|"completed"|"failed"|"skipped";startedAt:string;durationMs:number;outputHash?:string};
export type StageName = "extract"|"analyze"|"verify";
export type ModelCall = (stage:StageName, system:string, user:string) => Promise<string>;
export type RetrievalMetrics = {corpusUnits:number;candidateCount:number;selectedCount:number;embeddingHits:number;embeddingMisses:number;retrievalCacheHit:boolean;rerankModel:string};
