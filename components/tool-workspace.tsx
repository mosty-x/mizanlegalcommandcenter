"use client";

import Link from "next/link";
import { ChangeEvent, DragEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, File, FilePlus2, History, Loader2, LockKeyhole, Play, ShieldCheck, Trash2, UploadCloud, X } from "lucide-react";
import { getTool } from "@/lib/tool-definitions";
import type { ToolDefinition } from "@/lib/tool-definitions";
import { extractDocument } from "@/lib/client/extract-document";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PremiumSelect } from "@/components/premium-select";
import { TransparencyView, type WorkflowTrace } from "@/components/transparency-view";
import { cn } from "@/lib/utils";

type Provider = { id: string; label: string; provider: string; model: string };
type DocumentRow = { id: string; fileName: string; sizeBytes: number; sha256: string; createdAt: string };
type RunRow = { id: string; title: string; status: string; model: string; sourceCount: number; approvedAt: string | null; createdAt: string };

export function ToolWorkspace({ toolSlug }: { toolSlug: ToolDefinition["slug"] }) {
  const tool = getTool(toolSlug)!;
  const [providers, setProviders] = useState<Provider[]>([]);
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [providerId, setProviderId] = useState("");
  const [title, setTitle] = useState("");
  const [objective, setObjective] = useState("");
  const [jurisdiction, setJurisdiction] = useState("مصر");
  const [uploading, setUploading] = useState(false);
  const [running, setRunning] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [message, setMessage] = useState("");
  const [trace, setTrace] = useState<WorkflowTrace | null>(null);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [loadingRun, setLoadingRun] = useState("");

  const loadData = useCallback(async () => {
    const [providerResponse, documentResponse, runResponse] = await Promise.all([
      fetch("/api/providers", { cache: "no-store" }),
      fetch(`/api/documents?tool=${tool.slug}`, { cache: "no-store" }),
      fetch(`/api/runs?tool=${tool.slug}`, { cache: "no-store" }),
    ]);
    if (providerResponse.ok) {
      const data = await providerResponse.json();
      setProviders(data.providers ?? []);
      setProviderId((current) => current || data.providers?.[0]?.id || "");
    }
    if (documentResponse.ok) {
      const data = await documentResponse.json();
      setDocuments(data.documents ?? []);
      setSelected((current) => current.length ? current : (data.documents ?? []).slice(0, 8).map((doc: DocumentRow) => doc.id));
    }
    if (runResponse.ok) setRuns((await runResponse.json()).runs ?? []);
  }, [tool.slug]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadData().catch(() => setMessage("تعذّر تحميل مساحة العمل."));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  async function uploadFiles(files: File[]) {
    if (!files.length) return;
    setUploading(true);
    setMessage("");
    try {
      for (const file of files.slice(0, 8)) {
        const extracted = await extractDocument(file);
        const response = await fetch("/api/documents", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ toolSlug: tool.slug, ...extracted }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || `تعذّر رفع ${file.name}`);
        setSelected((current) => Array.from(new Set([...current, data.document.id])).slice(0, 8));
      }
      await loadData();
      setMessage("الملفات اترفعت واتشفّرت بنجاح.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذّر رفع الملفات.");
    } finally {
      setUploading(false);
    }
  }

  async function runWorkflow() {
    if (!providerId || !selected.length || !title.trim() || !objective.trim()) {
      setMessage("اختار مزود ومستند، واكتب اسم الملف والهدف المطلوب.");
      return;
    }
    setRunning(true);
    setMessage("");
    setTrace(null);
    try {
      const response = await fetch("/api/workflows/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ toolSlug: tool.slug, providerId, documentIds: selected, title, objective, jurisdiction }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "التشغيل ماكملش.");
      setTrace(data.run);
      await loadData();
      requestAnimationFrame(() => document.getElementById("workflow-result")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "التشغيل ماكملش.");
    } finally {
      setRunning(false);
    }
  }

  async function openRun(id: string) {
    setLoadingRun(id); setMessage("");
    const response = await fetch(`/api/runs?id=${encodeURIComponent(id)}`, { cache: "no-store" });
    const data = await response.json();
    if (response.ok) {
      setTrace(data.run);
      requestAnimationFrame(() => document.getElementById("workflow-result")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } else setMessage(data.error || "تعذّر فتح التشغيل.");
    setLoadingRun("");
  }

  async function deleteDocument(id: string) {
    const response = await fetch(`/api/documents?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (response.ok) {
      setDocuments((rows) => rows.filter((row) => row.id !== id));
      setSelected((ids) => ids.filter((value) => value !== id));
    }
  }

  function receiveFiles(event: ChangeEvent<HTMLInputElement>) {
    uploadFiles(Array.from(event.target.files ?? [])).catch(() => undefined);
    event.target.value = "";
  }
  function dropFiles(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault(); setDragging(false);
    uploadFiles(Array.from(event.dataTransfer.files)).catch(() => undefined);
  }
  const selectedProvider = useMemo(() => providers.find((provider) => provider.id === providerId), [providerId, providers]);
  const ToolIcon = tool.icon;

  return (
    <div className={`page-wrap tool-page accent-${tool.accent}`}>
      <section className="tool-titlebar">
        <div className="tool-number">{tool.number}</div>
        <div className="tool-title-icon"><ToolIcon /></div>
        <div><p className="eyebrow">{tool.title}</p><h1>{tool.shortName}</h1><p>{tool.description}</p></div>
        <Link href="/" className="secondary-action">كل الأدوات <ArrowLeft /></Link>
      </section>
      <section className="workflow-rail">
        {tool.steps.map((step, index) => <div key={step}><span>{String(index + 1).padStart(2, "0")}</span><strong>{step}</strong>{index < tool.steps.length - 1 && <i />}</div>)}
      </section>
      <div className="workspace-grid">
        <section className="workspace-card documents-panel">
          <div className="panel-heading"><span className="panel-step">A</span><div><h2>المستندات</h2><p>PDF، Word، أو نصوص — بحد أقصى 8 ملفات للتشغيل.</p></div><span className="selection-count">{selected.length}/8 مختار</span></div>
          <label className={cn("drop-zone", dragging && "dragging")} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={dropFiles}>
            <input type="file" multiple accept=".pdf,.docx,.txt,.md,.csv,.json" onChange={receiveFiles} disabled={uploading} />
            {uploading ? <Loader2 className="spin" /> : <UploadCloud />}
            <strong>{uploading ? "بنجهّز ونشفّر الملفات..." : "اسحب الملفات هنا أو دوس للاختيار"}</strong>
            <small>10 MB للملف · النص بيتجهز داخل متصفحك قبل الرفع</small>
          </label>
          <div className="document-list">
            {documents.length ? documents.map((document) => {
              const checked = selected.includes(document.id);
              return <div key={document.id} className={cn("document-row", checked && "selected")}>
                <button className="document-select" onClick={() => setSelected((current) => checked ? current.filter((id) => id !== document.id) : current.length < 8 ? [...current, document.id] : current)} aria-label={checked ? "إلغاء اختيار الملف" : "اختيار الملف"}>{checked ? <CheckCircle2 /> : <span />}</button>
                <File /><div><strong>{document.fileName}</strong><small>{formatBytes(document.sizeBytes)} · SHA {document.sha256.slice(0, 10)}…</small></div>
                <button className="icon-button" onClick={() => deleteDocument(document.id)} aria-label="حذف الملف"><Trash2 /></button>
              </div>;
            }) : <div className="empty-state"><FilePlus2 /><strong>لسه مفيش مستندات</strong><p>ارفع المادة اللي المحرك هيشتغل عليها، ومش هنعتبر أي معلومة من بره الملفات حقيقة.</p></div>}
          </div>
        </section>
        <section className="workspace-card run-panel">
          <div className="panel-heading"><span className="panel-step">B</span><div><h2>أمر التشغيل</h2><p>حدّد القضية والهدف؛ المخرجات هتفضل تحت المراجعة.</p></div></div>
          {!providers.length && <div className="notice amber"><LockKeyhole /><span>محتاج تضيف مزود AI الأول. المفتاح بيتشفّر ومش بيتحفظ في المتصفح.</span><Link href="/settings">افتح الإعدادات</Link></div>}
          <label className="field-label"><span>اسم الملف / المهمة</span><Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="مثال: مراجعة عقد توريد — مشروع القاهرة" maxLength={180} /></label>
          <label className="field-label"><span>النتيجة المطلوبة</span><Textarea value={objective} onChange={(event) => setObjective(event.target.value)} placeholder={tool.inputHint} maxLength={2500} rows={6} /></label>
          <div className="field-pair">
            <label className="field-label"><span>الاختصاص</span><Input value={jurisdiction} onChange={(event) => setJurisdiction(event.target.value)} placeholder="مصر" maxLength={120} /></label>
            <label className="field-label"><span>مزود التحليل</span><PremiumSelect value={providerId} onValueChange={setProviderId} placeholder="اختار مزود" ariaLabel="مزود التحليل" groupLabel="المزودات الجاهزة" disabled={!providers.length} options={providers.map((provider) => ({ value: provider.id, label: provider.label, meta: `${provider.provider} · ${provider.model}` }))} /></label>
          </div>
          <div className="execution-box">
            <div><ShieldCheck /><span><strong>قبل ما تبدأ</strong><small>{selectedProvider?.provider === "ssh-gateway" ? "الملفات الأصلية وإعدادات المكتب هتتبعت لسيرفرك للتنفيذ. راجع صلاحيات محركه؛ النتيجة هنا تفضل تحت اعتماد المحامي." : "الـAI هيطلع تحليل ومراجع؛ مش هينفذ إجراء قانوني أو يبعث حاجة لحد."}</small></span></div>
            <ul><li>المصادر: {selected.length} مستند</li><li>الموديل: {selectedProvider?.model ?? "غير محدد"}</li><li>الاعتماد: يدوي إلزامي</li></ul>
          </div>
          {message && <div className="inline-message"><X />{message}</div>}
          <Button className="run-button" size="lg" onClick={runWorkflow} disabled={running || !providers.length}>
            {running ? <Loader2 className="spin" /> : <Play />} {running ? (selectedProvider?.provider === "ssh-gateway" ? "سيرفرك بينفّذ المهمة — مستنيين النتيجة..." : "المحرك بيحلّل ويربط المصادر...") : tool.actionLabel}
          </Button>
        </section>
      </div>
      {runs.length > 0 && <section className="run-history"><div><History /><span><strong>تشغيلات سابقة</strong><small>النتائج محفوظة مشفّرة وتقدر تفتح سجل الشفافية كامل.</small></span></div><div>{runs.slice(0, 6).map((run) => <button key={run.id} onClick={() => openRun(run.id)} disabled={loadingRun === run.id}><span>{run.approvedAt ? "معتمد" : run.status === "completed" ? "للمراجعة" : "غير مكتمل"}</span><strong>{run.title}</strong><small>{new Date(run.createdAt).toLocaleDateString("ar-EG")} · {run.model} · {run.sourceCount} مصدر</small>{loadingRun === run.id ? <Loader2 className="spin" /> : <ArrowLeft />}</button>)}</div></section>}
      {trace && <section id="workflow-result" className="result-section"><TransparencyView trace={trace} /></section>}
    </div>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
