"use client";
import { useState } from "react";
import type { LegalUnit } from "@/lib/rag/contracts";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
export function LegalUnitEditor({unit,busy,onSave}:{unit:LegalUnit;busy:boolean;onSave:(unit:LegalUnit)=>Promise<void>}){
 const [draft,setDraft]=useState(unit),[confirmed,setConfirmed]=useState(false);
 const fields=[['title','عنوان النص'],['sourceUrl','رابط الوثيقة الأصلية'],['instrumentId','التشريع أو الحكم'],['unitLabel','المادة أو الفقرة'],['publishedOn','تاريخ النشر'],['validFrom','بداية السريان'],['validTo','نهاية السريان إن وجدت'],['verifiedOn','تاريخ مراجعة النص والتعديلات'],['reviewer','اسم المراجع']] as const;
 return <details className="legal-unit-editor"><summary>تصحيح النص أو بيانات المراجعة</summary><p>الحفظ يستبدل الوحدة بمعرف جديد ويبطل اعتماد النتائج المرتبطة بالإصدار السابق. لإضافة تعديل تشريعي مع الاحتفاظ بالفترات السابقة، استورد وحدات مستقلة محددة السريان.</p><div className="field-pair">{fields.map(([key,label])=><label className="field-label" key={key}><span>{label}</span><Input type={['publishedOn','validFrom','validTo','verifiedOn'].includes(key)?'date':'text'} value={draft[key]??''} onChange={e=>setDraft(p=>({...p,[key]:key==='validTo'?(e.target.value||null):e.target.value}))}/></label>)}</div><label className="field-label"><span>النص الأصلي كاملًا دون تغيير المعنى</span><Textarea className="legal-source-text" value={draft.text} onChange={e=>setDraft(p=>({...p,text:e.target.value}))} maxLength={5000}/><small>{draft.text.length} / ٥٠٠٠ حرف؛ قسّم المادة الطويلة لوحدات مترابطة دون حذف استثناءاتها.</small></label><label className="memory-consent"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>راجعت التصحيح والسريان وحق استخدام النص.</label><Button variant="outline" disabled={busy||!confirmed} onClick={()=>onSave({...draft,approved:true,rightsConfirmed:true})}>حفظ التصحيح بمعرف جديد</Button></details>;
}
