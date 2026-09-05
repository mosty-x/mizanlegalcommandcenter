"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { ArrowLeft, ArrowRight, Check, ChevronLeft, Loader2, LockKeyhole, RotateCcw, Scale, ShieldCheck } from "lucide-react";
import { TOOLS } from "@/lib/tool-definitions";

type Status={guideRequired:boolean;firstVisit:boolean;termsVersion:string;acceptedAt:string|null};

export function OnboardingGate({children}:{children:React.ReactNode}){
  const [status,setStatus]=useState<Status|null>(null);
  const [error,setError]=useState("");
  const [open,setOpen]=useState(false);
  const [active,setActive]=useState(0);
  const [viewed,setViewed]=useState<Set<string>>(new Set());
  const [accepted,setAccepted]=useState(false);
  const [saving,setSaving]=useState(false);

  async function load(){try{const response=await fetch("/api/onboarding",{cache:"no-store",credentials:"same-origin"});const data=await response.json();if(!response.ok)throw new Error(data.error||"تعذّر تجهيز دليل البداية.");setError("");setStatus(data);setOpen(data.guideRequired);if(data.guideRequired)setViewed(new Set([TOOLS[0].slug]));}catch(e){setError(e instanceof Error?e.message:"تعذّر تجهيز دليل البداية.");}}
  useEffect(()=>{const timer=window.setTimeout(()=>{load().catch(()=>undefined);},0);const show=()=>{setOpen(true);setViewed(new Set([TOOLS[0].slug]));setActive(0);};window.addEventListener("mizan:open-guide",show);return()=>{window.clearTimeout(timer);window.removeEventListener("mizan:open-guide",show);};},[]);

  const allViewed=useMemo(()=>TOOLS.every(tool=>viewed.has(tool.slug)),[viewed]);
  const mustAccept=status?.guideRequired??true;
  function selectWorkflow(index:number){setActive(index);setViewed(current=>new Set(current).add(TOOLS[index].slug));}
  async function finish(){if(!allViewed||(mustAccept&&!accepted))return;setSaving(true);setError("");try{if(mustAccept){const response=await fetch("/api/onboarding",{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify({acceptedTerms:true,viewedWorkflows:TOOLS.map(tool=>tool.slug)})});const data=await response.json();if(!response.ok)throw new Error(data.error||"تعذّر حفظ الموافقة.");setStatus(data);}setOpen(false);}catch(e){setError(e instanceof Error?e.message:"تعذّر حفظ الموافقة.");}finally{setSaving(false);}}

  if(!status&&!error)return <div className="onboarding-boot"><Image src="/mizan-mark.svg" width={84} height={84} alt="ميزان" priority/><Loader2/><span>بنجهّز مساحة العمل الآمنة</span></div>;
  if(!status)return <div className="onboarding-boot error"><RotateCcw/><strong>{error}</strong><button onClick={()=>load()}>حاول تاني</button></div>;
  const tool=TOOLS[active];const Icon=tool.icon;
  return <>
    {(!open||!mustAccept)&&children}
    {open&&<div className="onboarding-layer" role="dialog" aria-modal="true" aria-labelledby="guide-title">
      <div className="guide-shell">
        <header className="guide-header"><div className="guide-brand"><span><Image src="/mizan-mark.svg" width={44} height={44} alt=""/></span><div><strong>ميزان</strong><small>دليل التشغيل الأول</small></div></div><div className="guide-state"><span>{viewed.size}/5</span><small>مسارات اتراجعت</small></div></header>
        <div className="guide-body">
          <aside className="guide-index"><p className="eyebrow">مسارات العمل</p>{TOOLS.map((item,index)=>{const ItemIcon=item.icon;return <button key={item.slug} className={index===active?"active":""} onClick={()=>selectWorkflow(index)}><span>{item.number}</span><ItemIcon/><div><strong>{item.shortName}</strong><small>{item.title}</small></div>{viewed.has(item.slug)&&<Check/>}</button>;})}<div className="guide-security"><ShieldCheck/><span><strong>المحامي صاحب القرار</strong><small>المنصة تحلل وتقترح، ولا تعتمد أو ترسل بدلًا عنه.</small></span></div></aside>
          <main className={`guide-workflow accent-${tool.accent}`}>
            <div className="guide-kicker"><span>{tool.number}</span><p>{tool.title}</p></div>
            <div className="guide-title-row"><div className="guide-tool-icon"><Icon/></div><div><h1 id="guide-title">{tool.shortName}</h1><p>{tool.description}</p></div></div>
            <section className="guide-flow"><p className="eyebrow">بيشتغل إزاي؟</p><div>{tool.steps.map((step,index)=><article key={step}><span>{String(index+1).padStart(2,"0")}</span><strong>{step}</strong>{index<tool.steps.length-1&&<i><ChevronLeft/></i>}</article>)}</div></section>
            <section className="guide-input"><LockKeyhole/><div><strong>إنت بتدخل المستند والهدف</strong><p>{tool.inputHint}</p></div></section>
            <section className="terms-box"><div className="terms-title"><Scale/><div><strong>شروط الاستخدام والخصوصية</strong><small>الإصدار {status.termsVersion}</small></div></div><ul><li>النتائج تحليل مساعد وليست رأيًا قانونيًا نهائيًا، ويلزم اعتماد محامٍ مختص.</li><li>المستندات والمفاتيح تُشفّر على الخادم، والطلبات اللازمة للتحليل تُرسل لمزود الذكاء الذي يختاره المستخدم.</li><li>يجب امتلاك صلاحية رفع المستندات واستخدام بياناتها، وعدم رفع أسرار لا يسمح العميل بمعالجتها.</li><li>نستخدم ملف تعريف ارتباط أساسيًا وموقّعًا لتذكر إكمال الدليل وقبول نسخة الشروط، بدون تتبع إعلاني.</li><li>تغيير نسخة الشروط يعرض الدليل والموافقة من جديد.</li></ul>{mustAccept?<label className="terms-check"><input type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)}/><span><Check/></span><strong>قريت الشروط وفاهم حدود المنصة وموافق عليها.</strong></label>:<div className="terms-accepted"><Check/> تم قبول الشروط سابقًا. فتح الدليل هنا للمراجعة فقط.</div>}</section>
            {error&&<p className="guide-error">{error}</p>}
            <footer className="guide-actions"><button className="guide-secondary" disabled={active===0} onClick={()=>selectWorkflow(Math.max(0,active-1))}><ArrowRight/> السابق</button>{active<TOOLS.length-1?<button className="guide-primary" onClick={()=>selectWorkflow(Math.min(TOOLS.length-1,active+1))}>التالي <ArrowLeft/></button>:<button className="guide-primary launch" disabled={!allViewed||(mustAccept&&!accepted)||saving} onClick={finish}>{saving?<Loader2 className="spin"/>:<ArrowLeft/>} تشغيل نسخة الإنتاج</button>}</footer>
          </main>
        </div>
      </div>
    </div>}
  </>;
}
