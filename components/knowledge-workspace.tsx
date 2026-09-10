"use client";
import { useCallback,useEffect,useState } from "react";
import Link from "next/link";
import { BookOpen,Database,FileUp,Loader2,Trash2 } from "lucide-react";
import { LegalUnitEditor } from "@/components/legal-unit-editor";
import { Button } from "@/components/ui/button";
import { FilePicker } from "@/components/file-picker";
import { NumberField } from "@/components/number-field";
import { PremiumSelect } from "@/components/premium-select";
import type { LegalUnit,RagPolicy } from "@/lib/rag/contracts";
import type { DagDefinition } from "@/lib/rag/definitions";

type Provider={id:string;label:string;model:string;provider:string;baseUrl:string};
type Catalog={id:string;name:string;url:string;access:string;tools:readonly string[]};
const initial={sourceIds:[],embeddingProviderId:"",rerankProviderId:"",verifierProviderId:"",topK:8,candidateK:30,minRerankScore:0.5,maxSourceAgeDays:90,maxItems:8,kvBackend:"provider-managed"} as Omit<RagPolicy,"sourcesUsedByOffice">;
export function KnowledgeWorkspace(){
  const [units,setUnits]=useState<LegalUnit[]>([]),[catalog,setCatalog]=useState<Catalog[]>([]),[dags,setDags]=useState<DagDefinition[]>([]);
  const [providers,setProviders]=useState<Provider[]>([]),[policy,setPolicy]=useState(initial),[attested,setAttested]=useState(false);
  const [message,setMessage]=useState(""),[busy,setBusy]=useState(false),[revision,setRevision]=useState("");
  const refresh=useCallback(async()=>{const responses=await Promise.all([fetch("/api/knowledge",{cache:"no-store"}),fetch("/api/providers",{cache:"no-store"})]);
    if(!responses[0].ok)throw new Error("تعذّر فتح الذاكرة. راجع جلسة المستخدم.");
    const data=await responses[0].json();setUnits(data.units);setCatalog(data.catalog);setDags(data.dags);setRevision(data.revision);
    if(data.policy){setPolicy(data.policy);setAttested(data.policy.sourcesUsedByOffice===true);}
    if(responses[1].ok)setProviders((await responses[1].json()).providers??[]);
  },[]);
  useEffect(()=>{const timer=setTimeout(()=>{refresh().catch(e=>setMessage(e.message));},0);return()=>clearTimeout(timer);},[refresh]);
  async function mutate(action:string,data?:unknown){setBusy(true);setMessage("");try{const res=await fetch("/api/knowledge",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action,data})});const result=await res.json();if(!res.ok)throw new Error([result.error,...(result.fields??[]).slice(0,4).map((f:{path:string;message:string})=>`${f.path}: ${f.message}`)].join("\n"));setMessage("اتحفظت التغييرات واتحدّث نطاق الذاكرة.");await refresh();}catch(e){setMessage(e instanceof Error?e.message:"التحديث فشل.");}finally{setBusy(false);}}
  async function revoke(id:string){setBusy(true);try{const res=await fetch(`/api/knowledge?id=${encodeURIComponent(id)}`,{method:"DELETE"});if(!res.ok)throw new Error("تعذّر سحب النص.");await refresh();setMessage("النص اتسحب. النتائج القديمة المرتبطة بإصدار الذاكرة ده تحتاج إعادة تشغيل قبل اعتمادها.");}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}}
  function exportMemory(){const url=URL.createObjectURL(new Blob([JSON.stringify({units},null,2)],{type:"application/json"}));const a=document.createElement("a");a.href=url;a.download="mizan-reviewed-memory.json";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  const options=providers.filter(p=>p.provider!=="ssh-gateway").map(p=>({value:p.id,label:p.label,meta:`${p.provider} · ${p.model}`}));
  return <div className="page-wrap knowledge-page">
    <section className="tool-titlebar"><div className="tool-title-icon"><Database/></div><div><p className="eyebrow">EGYPT · EVIDENCE MEMORY</p><h1>الذاكرة القانونية المصرية</h1><p>المحركات تبحث جوّه النصوص اللي راجعتها وسمحت بيها. أي مصدر خارجها مش هيدخل التحليل.</p></div></section>
    <div className="notice amber"><BookOpen/><span>المكتبة بتبدأ فارغة. اختيار موقع مش بيحمّل قوانينه: استورد النصوص المسموح باستخدامها بعد مراجعة الإصدار والسريان. مراجعة الآلة تفضل محتاجة محامي.</span></div>
    <div className="workspace-grid">
      <section className="workspace-card"><div className="panel-heading"><span className="panel-step">01</span><div><h2>المصادر اللي المكتب بيستخدمها</h2><p>دي قائمة موثقة بهوية الجهات، وليست ترتيبًا لشعبيتها بين المكاتب.</p></div></div>
        <div className="memory-sources">{catalog.map(source=><article key={source.id} className="memory-source"><label><input type="checkbox" checked={policy.sourceIds.includes(source.id)} onChange={e=>setPolicy(p=>({...p,sourceIds:e.target.checked?[...p.sourceIds,source.id]:p.sourceIds.filter(id=>id!==source.id)}))}/><strong>{source.name}</strong></label><p>{source.access}</p><a href={source.url} target="_blank" rel="noreferrer">افتح المصدر الرسمي</a></article>)}</div>
        <label className="memory-consent"><input type="checkbox" checked={attested} onChange={e=>setAttested(e.target.checked)}/><span>المكتب بيستخدم المصادر المحددة، وهنراجع حق استخدام النصوص وسريانها قبل استيرادها.</span></label>
      </section>
      <section className="workspace-card"><div className="panel-heading"><span className="panel-step">02</span><div><h2>خدمات البحث والتحقق</h2><p>مفاتيح الخدمات تتسجل في الخزنة؛ هنا بنختار وظيفة كل مزود.</p></div></div>
        <Link className="secondary-action" href="/specialize">طوّر تعليمات كل تخصص</Link>
        <Link className="secondary-action" href="/settings">افتح خزنة المزودات</Link>
        <label className="field-label"><span>مزود التضمين الدلالي</span><PremiumSelect value={policy.embeddingProviderId} onValueChange={v=>setPolicy(p=>({...p,embeddingProviderId:v}))} options={options} ariaLabel="مزود التضمين" placeholder="اختار خدمة التضمين"/><small>خدمة متوافقة مع التضمين؛ رابطها ينتهي باسم نقطة التضمين، والموديل يكون موديل تضمين.</small><code dir="ltr">/v1/embeddings</code></label>
        <label className="field-label"><span>مزود إعادة ترتيب النتائج</span><PremiumSelect value={policy.rerankProviderId} onValueChange={v=>setPolicy(p=>({...p,rerankProviderId:v}))} options={options} ariaLabel="مزود إعادة الترتيب" placeholder="اختار خدمة إعادة الترتيب"/><small>سجّلها كمزود متوافق في الخزنة، ببروتوكول إعادة ترتيب متوافق مع كوهير.</small><code dir="ltr">/v2/rerank</code></label>
        <label className="field-label"><span>مزود مراجعة الاستنتاجات</span><PremiumSelect value={policy.verifierProviderId} onValueChange={v=>setPolicy(p=>({...p,verifierProviderId:v}))} options={options} ariaLabel="مزود المراجعة" placeholder="اختار مزود المراجعة"/><small>مرحلة منفصلة عن التحليل. ممكن تستخدم موديلًا مختلفًا، مع قياس أدائه على ملفات مراجعة.</small></label>
        <div className="field-pair"><label className="field-label"><span>أقصى نتائج نهائية</span><NumberField label="أقصى نتائج نهائية" value={policy.maxItems} onValueChange={v=>setPolicy(p=>({...p,maxItems:v}))} min={1} max={16}/></label><label className="field-label"><span>صلاحية مراجعة المصدر بالأيام</span><NumberField label="صلاحية مراجعة المصدر بالأيام" value={policy.maxSourceAgeDays} onValueChange={v=>setPolicy(p=>({...p,maxSourceAgeDays:v}))} min={1} max={365}/></label></div>
        <div className="field-pair"><label className="field-label"><span>المرشحون قبل إعادة الترتيب</span><NumberField label="عدد المرشحين" value={policy.candidateK} onValueChange={v=>setPolicy(p=>({...p,candidateK:v}))} min={8} max={60}/></label><label className="field-label"><span>النصوص بعد إعادة الترتيب</span><NumberField label="النصوص بعد إعادة الترتيب" value={policy.topK} onValueChange={v=>setPolicy(p=>({...p,topK:v}))} min={2} max={16}/></label></div>
        <label className="field-label"><span>حد الصلة المطلوب — يحتاج معايرة بملفات المكتب</span><NumberField label="حد الصلة" value={policy.minRerankScore} onValueChange={v=>setPolicy(p=>({...p,minRerankScore:v}))} min={0} max={1} step={0.05}/></label>
        <label className="field-label"><span>ذاكرة سياق الموديل</span><PremiumSelect value={policy.kvBackend} onValueChange={v=>setPolicy(p=>({...p,kvBackend:v as RagPolicy["kvBackend"]}))} options={[{value:"provider-managed",label:"المزود يدير التخزين المؤقت"},{value:"vllm",label:"سيرفر خاص يدعم عزل ذاكرة السياق"}]} ariaLabel="ذاكرة السياق" placeholder="اختار وضع الذاكرة"/><small>اختيار السيرفر الخاص يرسل قيمة عزل لكل مساحة وملف. لازم خدمة الاستدلال تكون متوافقة معه. ده تحسين سرعة، مش معيار دقة قانونية.</small></label>
        <p className="ssh-help">لو التشغيل على سيرفر التنفيذ: التضمين وإعادة الترتيب والمراجعة كلها تتم عليه، ومفاتيحها تتحدد في ملف إعداده. استخدم أسماء ربط السيرفر في قالب السياسة المرفق. <a href="/examples/rag-policy-ssh.json" download>نزّل قالب سياسة السيرفر</a></p>
        <Button className="run-button" disabled={busy||!attested} onClick={()=>mutate("policy",{...policy,sourcesUsedByOffice:attested})}>{busy?<Loader2 className="spin"/>:<Database/>}حفظ نطاق الذاكرة والخدمات</Button>
      </section>
    </div>
    <section className="workspace-card memory-import"><div className="panel-heading"><span className="panel-step">03</span><div><h2>النصوص القانونية المراجعة</h2><p>لكل مادة أو فقرة: نص حرفي، مصدر، إصدار، تاريخ سريان، تاريخ مراجعة، واسم المراجع.</p></div></div>
      <div className="memory-actions"><Button variant="outline" disabled={!units.length} onClick={exportMemory}>نزّل ملف ذاكرتك القانوني كاملًا</Button><a className="secondary-action" href="/examples/rag/legal-unit-template.json" download>قالب استيراد النصوص</a><FilePicker label="استيراد نصوص راجعتها" accept=".json,application/json" disabled={busy} onChange={async e=>{const file=e.target.files?.[0];e.target.value="";if(!file)return;if(file.size>5000000){setMessage("ملف الاستيراد أكبر من الحد.");return;}try{await mutate("import",JSON.parse(await file.text()));}catch{setMessage("ملف الاستيراد غير صالح.");}}}/><Button variant="outline" disabled={busy} onClick={()=>mutate("clear-cache")}>مسح التخزين المؤقت للبحث</Button></div>
      <p className="memory-counter">{units.length} / ٥٠٠ وحدة قانونية · إصدار الذاكرة <bdi>{revision.slice(0,12)}</bdi></p>
      {units.length?<div className="memory-units">{units.map(unit=><details key={unit.id}><summary><span><strong>{unit.title}</strong><small>{unit.unitLabel} · تمت المراجعة {unit.verifiedOn}</small></span><span>{unit.validFrom} ← {unit.validTo??"مفتوح وفق مراجعتك"}</span></summary><p>معرف النص: <bdi>{unit.id}</bdi></p><p>{unit.reviewer} · {unit.framework} · {unit.tools.join(" · ")}</p><pre>{unit.text}</pre><LegalUnitEditor unit={unit} busy={busy} onSave={changed=>mutate("replace",{oldId:unit.id,expectedRevision:revision,unit:changed})}/><a href={unit.sourceUrl} target="_blank" rel="noreferrer">راجع المصدر</a><Button variant="outline" disabled={busy} onClick={()=>revoke(unit.id)}><Trash2/>اسحب النص من الذاكرة</Button></details>)}</div>:<div className="empty-state"><FileUp/><strong>الذاكرة لسه فاضية</strong><p>المحرك هيمتنع عن الاستنتاج لحد ما يكون عنده نص مناسب ومراجع.</p></div>}
    </section>
    <section className="memory-dags"><h2>مسار كل أداة ومحتوى ذاكرتها</h2>{dags.map(dag=><details key={dag.slug}><summary>{dag.title}<span>{dag.nodes.length} مراحل تنفيذ</span></summary><p>{dag.analysisInstruction}</p><ol>{dag.nodes.map(node=><li key={node.id}><strong>{node.label}</strong><small>{node.dependsOn.length?`تنتظر: ${node.dependsOn.join("، ")}`:"تبدأ مستقلة"}</small></li>)}</ol></details>)}</section>
    {message&&<div className="settings-message memory-message" role="status">{message}</div>}
  </div>;
}
