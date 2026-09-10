"use client";

import Link from "next/link";
import { ArrowLeft, CheckCircle2, CircleDashed, Database, KeyRound, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { TOOLS } from "@/lib/tool-definitions";

type Snapshot = { providerCount: number; documentCount: number; completedRuns: number; approvedRuns: number };

export function Dashboard() {
  const [snapshot, setSnapshot] = useState<Snapshot>({ providerCount: 0, documentCount: 0, completedRuns: 0, approvedRuns: 0 });
  useEffect(() => {
    Promise.all([
      fetch("/api/providers", { cache: "no-store" }).then((res) => res.ok ? res.json() : { providers: [] }),
      fetch("/api/documents", { cache: "no-store" }).then((res) => res.ok ? res.json() : { documents: [] }),
      fetch("/api/runs", { cache: "no-store" }).then((res) => res.ok ? res.json() : { runs: [] }),
    ]).then(([providers, documents, runs]) => {
      const list = runs.runs ?? [];
      setSnapshot({ providerCount: providers.providers?.length ?? 0, documentCount: documents.documents?.length ?? 0, completedRuns: list.filter((run: { status: string }) => run.status === "completed").length, approvedRuns: list.filter((run: { approvedAt: string | null }) => run.approvedAt).length });
    }).catch(() => undefined);
  }, []);
  return (
    <div className="page-wrap">
      <section className="hero-strip">
        <div>
          <span className="system-status"><span /> النظام جاهز</span>
          <p className="eyebrow">LEGAL OPERATIONS / 01</p>
          <h1>خمس أدوات. قيادة واحدة.</h1>
          <p>كل تحليل مربوط بالمصدر، وكل استنتاج واضح، وكل قرار النهائي فيه للمحامي.</p>
        </div>
        <Link href={snapshot.providerCount ? "/tools/enforceability" : "/settings"} className="primary-action">
          <Sparkles /> {snapshot.providerCount ? "ابدأ أول تشغيل" : "وصّل مزود الـAI"} <ArrowLeft />
        </Link>
      </section>
      <section className="metric-grid" aria-label="حالة مساحة العمل">
        <Metric icon={KeyRound} label="مزودات جاهزة" value={snapshot.providerCount} detail={snapshot.providerCount ? "الاتصال متاح" : "محتاج إعداد"} />
        <Metric icon={Database} label="مستندات مشفّرة" value={snapshot.documentCount} detail="معزولة لكل مستخدم" />
        <Metric icon={CircleDashed} label="تشغيلات مكتملة" value={snapshot.completedRuns} detail="بسجل شفافية" />
        <Metric icon={CheckCircle2} label="نتائج معتمدة" value={snapshot.approvedRuns} detail="اعتماد بشري صريح" />
      </section>
      <section className="section-heading">
        <div><p className="eyebrow">محركات العمل</p><h2>اختار الوجع اللي هتختصره</h2></div>
        <p>مش chatbot عام. كل أداة ليها منهج، مدخلات، وضوابط إخراج محددة.</p>
      </section>
      <section className="tool-grid">
        {TOOLS.map((tool) => {
          const Icon = tool.icon;
          return (
            <Link key={tool.slug} href={`/tools/${tool.slug}`} className={`tool-card accent-${tool.accent}`}>
              <span className="corner-index">{tool.number}</span>
              <div className="tool-icon"><Icon /></div>
              <p className="tool-en">{tool.title}</p>
              <h3>{tool.shortName}</h3>
              <p>{tool.description}</p>
              <div className="tool-footer"><span>{tool.steps.length} مراحل مضبوطة</span><span className="open-arrow"><ArrowLeft /></span></div>
            </Link>
          );
        })}
      </section>
      <section className="trust-bar">
        <ShieldItem title="لا ادعاء بلا مصدر" detail="أي مرجع غير موجود بيتعلّم كغير متحقق." />
        <ShieldItem title="مفيش تنفيذ تلقائي" detail="المنصة تحلل وتقترح؛ المحامي يعتمد ويتصرف." />
        <ShieldItem title="المفاتيح مش في المتصفح" detail="بيتم تشفيرها واستخدامها من الخادم فقط." />
      </section>
    </div>
  );
}

function Metric({ icon: Icon, label, value, detail }: { icon: typeof KeyRound; label: string; value: number; detail: string }) {
  return <article className="metric-card"><Icon /><div><span>{label}</span><strong>{String(value).padStart(2, "0")}</strong><small>{detail}</small></div></article>;
}

function ShieldItem({ title, detail }: { title: string; detail: string }) {
  return <div><CheckCircle2 /><span><strong>{title}</strong><small>{detail}</small></span></div>;
}
