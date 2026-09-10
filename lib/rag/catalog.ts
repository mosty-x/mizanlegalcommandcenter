import type { LegalUnit, ToolSlug } from "./contracts";

// Source identity is researched; actual office use is explicitly attested by the office.
// A URL is provenance metadata, NOT proof that the submitted text matches that website.
export const SOURCE_CATALOG = [
  { id:"eg-cassation", name:"محكمة النقض المصرية", hosts:["cc.gov.eg","www.cc.gov.eg"], url:"https://cc.gov.eg/", access:"محتوى متقدم باشتراك؛ استيراد مرخّص بعد المراجعة", tools:["enforceability","disputes","deal-room","regulatory","client-command"], kinds:["legislation","judgment"], evidence:"https://cc.gov.eg/subscription-notice" },
  { id:"eg-gafi", name:"الهيئة العامة للاستثمار والمناطق الحرة", hosts:["gafi.gov.eg","www.gafi.gov.eg","gafiadmin.gafi.gov.eg"], url:"https://gafi.gov.eg/en/booklet", access:"مكتبة رسمية؛ راجع الإصدار والتعديلات", tools:["enforceability","deal-room","regulatory","client-command"], kinds:["legislation","procedure"], evidence:"https://gafi.gov.eg/en/booklet" },
  { id:"eg-fra", name:"الهيئة العامة للرقابة المالية", hosts:["fra.gov.eg","www.fra.gov.eg"], url:"https://fra.gov.eg/", access:"تشريعات وإجراءات الهيئة ضمن اختصاصها", tools:["enforceability","deal-room","regulatory","client-command"], kinds:["legislation","procedure"], evidence:"https://fra.gov.eg/" },
  { id:"eg-crcica", name:"مركز القاهرة الإقليمي للتحكيم التجاري الدولي", hosts:["crcica.org","www.crcica.org","crcica.org.eg","www.crcica.org.eg"], url:"https://crcica.org/arbitration/crcica-arbitration-rules/", access:"قواعد مؤسسية بحسب اتفاق الأطراف؛ لا تنطبق تلقائيًا", tools:["enforceability","disputes","client-command"], kinds:["legislation","arbitration-rule","procedure"], evidence:"https://crcica.org/arbitration/relevant-legal-instruments/" },
] as const;
export const RESEARCHED_ON = "2026-09-10";
export function catalogSource(id:string) { return SOURCE_CATALOG.find(s => s.id === id); }
export function validateUnitSource(unit:LegalUnit) {
  const source = catalogSource(unit.sourceId);
  if (!source) throw new Error("RAG_SOURCE_DENIED");
  const url = new URL(unit.sourceUrl);
  if (url.protocol!=="https:" || url.username || url.password || url.port || url.hash || !(source.hosts as readonly string[]).includes(url.hostname)) throw new Error("RAG_SOURCE_DENIED");
  if (!(source.kinds as readonly string[]).includes(unit.kind) || unit.tools.some(t => !(source.tools as readonly string[]).includes(t))) throw new Error("RAG_SOURCE_DENIED");
  if (unit.kind === "arbitration-rule" && (unit.sourceId!=="eg-crcica" || unit.framework==="EG")) throw new Error("RAG_SOURCE_DENIED");
  if (unit.framework!=="EG" && unit.sourceId!=="eg-crcica") throw new Error("RAG_SOURCE_DENIED");
}
export function sourceAppliesToTool(id:string, tool:ToolSlug) { return (catalogSource(id)?.tools as readonly string[]|undefined)?.includes(tool) === true; }
