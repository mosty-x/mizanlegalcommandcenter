"use client";

import { Check, CheckCircle2, Clock3, ExternalLink, FileText, Info, ShieldAlert, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";

type Finding = {
  title: string; category: string; severity: string; explanation: string; recommendation: string;
  sourceRefs: string[]; verifiedSourceRefs: string[]; invalidSourceRefs: string[]; confidence: number;
  evidenceStatus?:string;citations?:Array<{sourceId:string;quote:string}>;
};
export type WorkflowTrace = {
  id: string; approvedAt?: string | null;
  output: { title: string; executiveSummary: string; findings: Finding[]; missingInformation: string[]; recommendedActions: string[]; assumptions: string[]; humanDecisionRequired: string[]; disclaimer: string };
  sources: Array<{ id: string; fileName: string; page: number }>;
  transparency: { provider: string; providerLabel: string; model: string; workflowVersion: string; durationMs: number; inputTokens: number | null; outputTokens: number | null; sourceTruncated: boolean; approvalStatus: string; executionLocation?: string; documentsSent?: string };
  product?:{type:string;groups:Record<string,Array<{id:string;title:string;statement:string;status:string;date:string|null;owner:string|null;dependsOn:string[]}>>;orderedIds?:string[]};
  rag?:{profile?:{revision:number;hash:string;label:string;reviewedBy:string};engineering?:{memory:Array<{id:string;label:string;status:string;durationMs:number}>;context:Array<{id:string;label:string;status:string;durationMs:number}>;excludedUnits:number};harness?:{maxContextChars:number};status:string;approvalEligible:boolean;asOf:string;corpusRevision:string;kvBackend:string;rejected:Array<{id:string;reason:string}>;nodes:Array<{id:string;label:string;status:string;durationMs:number}>;metrics:{corpusUnits:number;candidateCount:number;selectedCount:number;embeddingHits:number;embeddingMisses:number;retrievalCacheHit:boolean;rerankModel:string}};
};

export function TransparencyView({ trace }: { trace: WorkflowTrace }) {
  const [approvedAt, setApprovedAt] = useState(trace.approvedAt ?? null);
  const [busy, setBusy] = useState(false);
  const [approvalError, setApprovalError] = useState("");
  const sourceMap = useMemo(() => new Map(trace.sources.map((source) => [source.id, source])), [trace.sources]);
  async function approve() {
    setBusy(true);
    setApprovalError("");
    try {
      const response = await fetch("/api/runs", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ runId: trace.id, approved: true }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "تعذّر تسجيل الاعتماد. راجع حالة المصادر والإعدادات.");
      setApprovedAt(result.approvedAt);
    } catch (error) { setApprovalError(error instanceof Error ? error.message : "الاتصال اتقطع. جرّب تاني."); }
    finally { setBusy(false); }
  }
  return (
    <div className="result-stack">
      <section className="result-hero">
        <div><span className="result-kicker"><Sparkles /> نتيجة قابلة للمراجعة</span><h2>{trace.output.title}</h2><p>{trace.output.executiveSummary}</p></div>
        <div className="approval-box">
          <span>{approvedAt ? "اتراجع واتعتمد" : "في انتظار قرار بشري"}</span>
          <Button onClick={approve} disabled={busy || Boolean(approvedAt) || trace.rag?.approvalEligible===false} className="approve-button">
            {approvedAt ? <Check /> : <ShieldAlert />} {approvedAt ? "معتمد" : busy ? "جارٍ التسجيل..." : "اعتماد المحامي"}
          </Button>
          {approvalError && <p role="alert" className="form-error">{approvalError}</p>}
        </div>
      </section>
      {trace.rag&&<section className="workspace-card rag-trace"><h3>سجل البحث وفحص الأدلة</h3><p>تاريخ القانون المطلوب: {trace.rag.asOf} · إصدار الذاكرة: <bdi>{trace.rag.corpusRevision.slice(0,12)}</bdi></p><div className="memory-metrics"><span>{trace.rag.metrics.corpusUnits} نص داخل النطاق</span><span>{trace.rag.metrics.candidateCount} مرشح</span><span>{trace.rag.metrics.selectedCount} نص بعد إعادة الترتيب</span><span>{trace.rag.metrics.embeddingHits} تضمين من التخزين</span><span>{trace.rag.metrics.retrievalCacheHit?"إعادة الترتيب من التخزين":"إعادة ترتيب جديدة"}</span></div><ol className="rag-node-list">{trace.rag.nodes.map(node=><li key={node.id} data-status={node.status}><strong>{node.label}</strong><span>{node.status==="completed"?"اكتملت":node.status==="skipped"?"لم تُنفذ — لا سند":"توقفت"}</span><small>{(node.durationMs/1000).toFixed(2)} ثانية</small></li>)}</ol>{trace.rag.rejected.length>0&&<details><summary>{trace.rag.rejected.length} عناصر اتحجبت</summary><ul>{trace.rag.rejected.map((r,i)=><li key={i}>{r.id} — {r.reason}</li>)}</ul></details>}<p>مطابقة الاقتباس ومراجعة النموذج لا تعادلان صحة قانونية مؤكدة.</p></section>}
      {trace.rag?.profile&&<section className="workspace-card"><h3>إصدار التخصص وسياق التنفيذ</h3><p>{trace.rag.profile.label} · الإصدار {trace.rag.profile.revision} · مراجع التعليمات: {trace.rag.profile.reviewedBy}</p><p>بصمة التعليمات: <bdi>{trace.rag.profile.hash.slice(0,16)}</bdi> · ميزانية السياق {trace.rag.harness?.maxContextChars} حرف</p>{trace.rag.engineering&&<><p>{trace.rag.engineering.excludedUnits} وحدات استبعدها نطاق الذاكرة.</p><ol className="rag-node-list">{[...trace.rag.engineering.memory,...trace.rag.engineering.context].map(node=><li key={node.id} data-status={node.status}><strong>{node.label}</strong><span>{node.status==="completed"?"اكتملت":"لم تنفذ"}</span><small>{(node.durationMs/1000).toFixed(2)} ثانية</small></li>)}</ol>{!trace.rag.engineering.context.length&&<p>لم يُبنَ سياق تحليل لعدم وجود سند كافٍ.</p>}</>}</section>}
      <section className="trace-grid">
        <Trace label="المزود / الموديل" value={`${trace.transparency.providerLabel} · ${trace.transparency.model}`} />
        <Trace label="نسخة الـworkflow" value={trace.transparency.workflowVersion} />
        <Trace label="الوقت" value={`${(trace.transparency.durationMs / 1000).toFixed(1)} ثانية`} icon={Clock3} />
        <Trace label="الاستهلاك" value={`${trace.transparency.inputTokens ?? "—"} دخل / ${trace.transparency.outputTokens ?? "—"} خرج`} />
        {trace.transparency.executionLocation && <Trace label="مكان التنفيذ" value={trace.transparency.executionLocation} />}
        {trace.transparency.documentsSent && <Trace label="المستندات المرسلة" value={trace.transparency.documentsSent} />}
      </section>
      {trace.transparency.sourceTruncated && <div className="notice amber"><Info />حجم المصادر وصل للحد الآمن؛ النتيجة مبنية على الجزء المعلن فقط.</div>}
      <section className="findings-list">
        {trace.output.findings.map((finding, index) => (
          <article className="finding-card" key={`${finding.title}-${index}`}>
            <div className="finding-head"><span className={`severity severity-${finding.severity}`}>{finding.severity}</span><span className="finding-index">{String(index + 1).padStart(2, "0")}</span><div><small>{kindLabel(finding.category)}</small><h3>{finding.title}</h3></div><span className="confidence">{finding.evidenceStatus?"اجتاز فحص الأدلة":`تقدير الموديل ${finding.confidence}%`}</span></div>
            <p>{finding.explanation}</p>
            <div className="recommendation"><strong>المقترح</strong><span>{finding.recommendation}</span></div>
            <div className="source-list">
              {finding.verifiedSourceRefs.length ? finding.verifiedSourceRefs.map((ref) => {
                const source = sourceMap.get(ref);
                return <span key={ref} title={ref}><FileText /> {source?.fileName ?? ref} · صـ {source?.page ?? "—"}<CheckCircle2 /></span>;
              }) : <span className="unverified"><ShieldAlert /> مفيش سند متحقق — راجع النتيجة قبل استخدامها</span>}
              {finding.invalidSourceRefs.length > 0 && <span className="unverified"><ExternalLink /> {finding.invalidSourceRefs.length} مرجع غير صالح تم استبعاده</span>}
            </div>
            {finding.citations&&<details className="evidence-quotes"><summary>ورّيني النصوص اللي اتبنى عليها الاستنتاج</summary>{finding.citations.map((citation,i)=><blockquote key={i}><p>{citation.quote}</p><cite>{sourceMap.get(citation.sourceId)?.fileName??citation.sourceId}</cite></blockquote>)}</details>}
          </article>
        ))}
      </section>
      {trace.product&&<section className="workspace-card"><h3>السجل المتخصص</h3>{Object.entries(trace.product.groups).filter(([,items])=>items.length).map(([kind,items])=><div key={kind} className="rag-product"><h4>{kindLabel(kind)}</h4><div className="memory-table-wrap"><table><thead><tr><th>العنصر</th><th>التاريخ الصريح</th><th>المسؤول المذكور</th><th>يعتمد على</th></tr></thead><tbody>{items.map(item=><tr key={item.id}><td>{item.id} · {item.title}</td><td>{item.date??"غير محدد"}</td><td>{item.owner??"غير محدد"}</td><td>{item.dependsOn.join("، ")||"—"}</td></tr>)}</tbody></table></div></div>)}{trace.product.orderedIds&&<p>ترتيب التنفيذ وفق التبعيات: <bdi>{trace.product.orderedIds.join(" → ")}</bdi></p>}</section>}
      <section className="decision-grid">
        <DecisionBlock title="الخطوات المقترحة" items={trace.output.recommendedActions} />
        <DecisionBlock title="معلومات ناقصة" items={trace.output.missingInformation} warn />
        <DecisionBlock title="افتراضات التحليل" items={trace.output.assumptions} />
        <DecisionBlock title="قرارات محتاجة محامي" items={trace.output.humanDecisionRequired} warn />
      </section>
      <p className="disclaimer"><ShieldAlert /> {trace.output.disclaimer}</p>
    </div>
  );
}

function Trace({ label, value, icon: Icon }: { label: string; value: string; icon?: typeof Clock3 }) {
  return <div>{Icon ? <Icon /> : <span className="trace-dot" />}<span><small>{label}</small><strong>{value}</strong></span></div>;
}
function kindLabel(kind:string){return ({clause:"بند",risk:"مخاطرة قانونية",amendment:"صياغة مقترحة",event:"الخط الزمني",claim:"ادعاءات وأدلة",contradiction:"تعارضات", "evidence-gap":"فجوات إثبات","document-check":"جرد المستندات","red-flag":"مخاطر الصفقة","condition-precedent":"شروط سابقة للإغلاق",obligation:"التزامات",authority:"الجهات",procedure:"الإجراءات",requirement:"المتطلبات",progress:"حالة الملف","client-request":"المطلوب من العميل",deadline:"المواعيد الصريحة",decision:"القرارات"} as Record<string,string>)[kind]??kind;}
function DecisionBlock({ title, items, warn = false }: { title: string; items: string[]; warn?: boolean }) {
  return <article className={warn ? "warn" : ""}><h3>{title}</h3>{items.length ? <ul>{items.map((item, index) => <li key={index}>{item}</li>)}</ul> : <p>مفيش عناصر مسجلة.</p>}</article>;
}
