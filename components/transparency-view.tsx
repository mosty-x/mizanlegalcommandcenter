"use client";

import { Check, CheckCircle2, Clock3, ExternalLink, FileText, Info, ShieldAlert, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";

type Finding = {
  title: string; category: string; severity: string; explanation: string; recommendation: string;
  sourceRefs: string[]; verifiedSourceRefs: string[]; invalidSourceRefs: string[]; confidence: number;
};
export type WorkflowTrace = {
  id: string; approvedAt?: string | null;
  output: { title: string; executiveSummary: string; findings: Finding[]; missingInformation: string[]; recommendedActions: string[]; assumptions: string[]; humanDecisionRequired: string[]; disclaimer: string };
  sources: Array<{ id: string; fileName: string; page: number }>;
  transparency: { provider: string; providerLabel: string; model: string; workflowVersion: string; durationMs: number; inputTokens: number | null; outputTokens: number | null; sourceTruncated: boolean; approvalStatus: string; executionLocation?: string; documentsSent?: string };
};

export function TransparencyView({ trace }: { trace: WorkflowTrace }) {
  const [approvedAt, setApprovedAt] = useState(trace.approvedAt ?? null);
  const [busy, setBusy] = useState(false);
  const sourceMap = useMemo(() => new Map(trace.sources.map((source) => [source.id, source])), [trace.sources]);
  async function approve() {
    setBusy(true);
    const response = await fetch("/api/runs", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ runId: trace.id, approved: true }) });
    if (response.ok) setApprovedAt((await response.json()).approvedAt);
    setBusy(false);
  }
  return (
    <div className="result-stack">
      <section className="result-hero">
        <div><span className="result-kicker"><Sparkles /> نتيجة قابلة للمراجعة</span><h2>{trace.output.title}</h2><p>{trace.output.executiveSummary}</p></div>
        <div className="approval-box">
          <span>{approvedAt ? "اتراجع واتعتمد" : "في انتظار قرار بشري"}</span>
          <Button onClick={approve} disabled={busy || Boolean(approvedAt)} className="approve-button">
            {approvedAt ? <Check /> : <ShieldAlert />} {approvedAt ? "معتمد" : busy ? "جارٍ التسجيل..." : "اعتماد المحامي"}
          </Button>
        </div>
      </section>
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
            <div className="finding-head"><span className={`severity severity-${finding.severity}`}>{finding.severity}</span><span className="finding-index">{String(index + 1).padStart(2, "0")}</span><div><small>{finding.category}</small><h3>{finding.title}</h3></div><span className="confidence">ثقة {finding.confidence}%</span></div>
            <p>{finding.explanation}</p>
            <div className="recommendation"><strong>المقترح</strong><span>{finding.recommendation}</span></div>
            <div className="source-list">
              {finding.verifiedSourceRefs.length ? finding.verifiedSourceRefs.map((ref) => {
                const source = sourceMap.get(ref);
                return <span key={ref} title={ref}><FileText /> {source?.fileName ?? ref} · صـ {source?.page ?? "—"}<CheckCircle2 /></span>;
              }) : <span className="unverified"><ShieldAlert /> مفيش سند متحقق — راجع النتيجة قبل استخدامها</span>}
              {finding.invalidSourceRefs.length > 0 && <span className="unverified"><ExternalLink /> {finding.invalidSourceRefs.length} مرجع غير صالح تم استبعاده</span>}
            </div>
          </article>
        ))}
      </section>
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
function DecisionBlock({ title, items, warn = false }: { title: string; items: string[]; warn?: boolean }) {
  return <article className={warn ? "warn" : ""}><h3>{title}</h3>{items.length ? <ul>{items.map((item, index) => <li key={index}>{item}</li>)}</ul> : <p>مفيش عناصر مسجلة.</p>}</article>;
}
