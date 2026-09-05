"use client";

import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { CheckCircle2, Download, FileJson2, KeyRound, Loader2, LockKeyhole, PlugZap, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PremiumSelect } from "@/components/premium-select";
import { NumberField } from "@/components/number-field";
import { FilePicker } from "@/components/file-picker";

type Provider = { id: string; label: string; provider: string; model: string; baseUrl: string };
const CONFIGS = [
  ["firm-profile", "تعريف المكتب", "اسم المكتب والفروع وبيانات التواصل"],
  ["provider-catalog", "سياسة المزودات", "المزودات والموديلات المسموحة — بدون أي مفاتيح"],
  ["practice-policy", "سياسة الممارسة", "الاختصاصات والاحتفاظ والحدود البشرية"],
  ["source-registry", "سجل المصادر", "مصادر رسمية موثوقة وترتيب قوة كل مصدر"],
  ["workflow-config", "إعداد سير العمل", "الأدوات المفعّلة وحدود كل تشغيل"],
] as const;

export function ProviderVault() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState("");
  const [message, setMessage] = useState("");
  const [configs, setConfigs] = useState<Record<string, unknown>>({});
  const [providerType, setProviderType] = useState("openai");
  const [testedIds, setTestedIds] = useState<Set<string>>(new Set());
  const [sshKey, setSshKey] = useState("");

  async function refresh() {
    const [providerRes, configRes] = await Promise.all([fetch("/api/providers", { cache: "no-store" }), fetch("/api/configuration", { cache: "no-store" })]);
    if (providerRes.ok) setProviders((await providerRes.json()).providers ?? []);
    if (configRes.ok) setConfigs((await configRes.json()).configs ?? {});
  }
  useEffect(() => {
    const timer = window.setTimeout(() => { refresh().catch(() => undefined); }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function addProvider(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setMessage("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const provider = String(form.get("provider"));
    const payload = { label: form.get("label"), provider, model: form.get("model"), ...(provider === "ssh-gateway" ? { ssh: {
      host: form.get("sshHost"), port: Number(form.get("sshPort")), username: form.get("sshUsername"),
      privateKey: sshKey, passphrase: String(form.get("sshPassphrase") || ""), fingerprint: form.get("sshFingerprint"),
    } } : { apiKey: form.get("apiKey"), ...(provider === "openai-compatible" ? { baseUrl: form.get("baseUrl") } : {}) }) };
    try {
    const response = await fetch("/api/providers", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const data = await response.json();
    if (response.ok) { formElement.reset(); setSshKey(""); setProviderType("openai"); setMessage("المزود اتحفظ في الخزنة المشفّرة. اختبر الاتصال قبل التشغيل."); await refresh(); }
    else setMessage(data.error || "تعذّر حفظ المزود.");
    } catch { setMessage("الاتصال بالمنصة اتقطع. جرّب تاني."); }
    finally { setSaving(false); }
  }
  async function testProvider(id: string) {
    setTesting(id); setMessage("");
    try {
    const response = await fetch("/api/providers/test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ providerId: id }) });
    const data = await response.json();
    setMessage(response.ok ? `الاتصال سليم — ${data.durationMs} ms.` : data.error || "اختبار الاتصال فشل.");
    setTestedIds(previous => { const next = new Set(previous); if (response.ok) next.add(id); else next.delete(id); return next; });
    } catch { setMessage("الاتصال بالمنصة اتقطع أثناء الاختبار."); }
    finally { setTesting(""); }
  }
  async function removeProvider(id: string) {
    const response = await fetch(`/api/providers?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (response.ok) await refresh();
  }
  async function uploadConfig(kind: string, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const response = await fetch("/api/configuration", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, data }) });
      const result = await response.json();
      setMessage(response.ok ? `ملف ${file.name} اتراجع واتحفظ.` : result.error || "ملف التخصيص غير صالح.");
      if (response.ok) await refresh();
    } catch { setMessage("الملف لازم يكون JSON صالح ومطابق للقالب."); }
    event.target.value = "";
  }
  return (
    <div className="page-wrap settings-page">
      <section className="settings-hero"><div><p className="eyebrow">SECURE CONTROL PLANE</p><h1>الإعداد والتخصيص</h1><p>وصّل مزودك، وحدّد قواعد المكتب. مفيش أي credential مطلوب جوه ملفات التخصيص.</p></div><div className="vault-badge"><LockKeyhole /><span><strong>خزنة مشفّرة</strong><small>AES-GCM · معزولة لكل مستخدم</small></span></div></section>
      <div className="settings-grid">
        <section className="workspace-card provider-form-card">
          <div className="panel-heading"><span className="panel-step">01</span><div><h2>إضافة مزود AI</h2><p>المفتاح بيتبعت للخادم، يتشفّر، ومش بيرجع للواجهة تاني.</p></div></div>
          <form onSubmit={addProvider} className="provider-form">
            <label className="field-label"><span>اسم واضح للمزود</span><Input name="label" required minLength={2} placeholder="مثال: OpenAI المكتب" autoComplete="off" /></label>
            <div className="field-pair"><label className="field-label"><span>نوع المزود</span><PremiumSelect name="provider" value={providerType} onValueChange={(value) => { setProviderType(value); setSshKey(""); }} placeholder="اختار نوع المزود" ariaLabel="نوع مزود الذكاء الاصطناعي" groupLabel="مزودات مدعومة" options={[{ value: "openai", label: "OpenAI", meta: "نماذج GPT" }, { value: "anthropic", label: "Anthropic", meta: "نماذج Claude" }, { value: "gemini", label: "Google Gemini", meta: "نماذج Gemini" }, { value: "openai-compatible", label: "OpenAI Compatible", meta: "خادم متوافق ومسموح" }, { value: "ssh-gateway", label: "SSH Gateway", meta: "سيرفرك ينفّذ المهمة بالكامل" }]} /></label><label className="field-label"><span>{providerType === "ssh-gateway" ? "اسم ملف التشغيل على السيرفر" : "اسم الموديل"}</span><Input name="model" required maxLength={120} placeholder={providerType === "ssh-gateway" ? "مثال: legal-default" : "مثال: gpt-5-mini"} autoComplete="off" /></label></div>
            {providerType === "ssh-gateway" ? <div className="ssh-fields">
              <div className="credential-note"><PlugZap /><span>السيرفر هيستلم الملفات الأصلية والمقتطفات وإعدادات المكتب وينفّذ المهمة. لازم يكون عليه برنامج استقبال متوافق. <a href="/ssh-gateway-guide.md" download>نزّل دليل الربط</a></span></div>
              <div className="field-pair"><label className="field-label"><span>عنوان السيرفر</span><Input name="sshHost" dir="ltr" required maxLength={253} placeholder="server.example.com" autoComplete="off" /></label><div className="field-label"><label htmlFor="ssh-port" className="field-caption">منفذ الاتصال</label><NumberField id="ssh-port" name="sshPort" label="منفذ الاتصال" min={1} max={65535} defaultValue={22} required disabled={saving} /></div></div>
              <label className="field-label"><span>اسم المستخدم على السيرفر</span><Input name="sshUsername" dir="ltr" required maxLength={64} placeholder="mizan" autoComplete="off" /></label>
              <label className="field-label"><span>المفتاح الخاص — الصق المحتوى أو ارفع الملف</span><Textarea name="sshPrivateKey" dir="ltr" required minLength={80} maxLength={16000} rows={5} value={sshKey} onChange={(event) => setSshKey(event.target.value)} spellCheck={false} autoComplete="off" placeholder="-----BEGIN OPENSSH PRIVATE KEY-----" /></label>
              <div className="field-label"><span>رفع ملف المفتاح</span><FilePicker label="رفع مفتاح SSH الخاص" disabled={saving} onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; if (file.size > 16000) { setMessage("ملف المفتاح أكبر من 16 كيلوبايت."); event.target.value = ""; return; } try { setSshKey(await file.text()); } catch { setMessage("تعذّر قراءة ملف المفتاح."); } }} /></div>
              <label className="field-label"><span>كلمة سر المفتاح — لو المفتاح محمي</span><Input name="sshPassphrase" dir="ltr" type="password" maxLength={1024} autoComplete="new-password" /></label>
              <label className="field-label"><span>بصمة السيرفر الموثوقة</span><Input name="sshFingerprint" dir="ltr" required maxLength={51} placeholder="SHA256:..." autoComplete="off" /><small>هات البصمة من مسؤول السيرفر أو من شاشة السيرفر مباشرة. اختلافها بيوقف الاتصال.</small></label>
              <p className="ssh-help">مسؤول الاستضافة لازم يسمح بالعنوان والمنفذ في إعداد ALLOWED_SSH_HOSTS. بيانات الدخول لوحدها مش بتثبت برنامج استقبال على السيرفر.</p>
            </div> : <>
              {providerType === "openai-compatible" && <label className="field-label"><span>رابط الخدمة المتوافقة</span><Input name="baseUrl" type="url" required placeholder="https://api.example.com/v1/chat/completions" autoComplete="off" /></label>}
              <label className="field-label"><span>API key</span><Input name="apiKey" type="password" required minLength={8} maxLength={1000} placeholder="••••••••••••••••" autoComplete="new-password" /></label>
            </>}
            <div className="credential-note"><ShieldCheck /><span>مش بنحفظ المفتاح في Local Storage، ومش بنكتبه في logs أو ملفات المكتب.</span></div>
            <Button type="submit" disabled={saving} className="run-button">{saving ? <Loader2 className="spin" /> : <KeyRound />} {saving ? "بنشفّر ونحفظ..." : "حفظ في الخزنة"}</Button>
          </form>
        </section>
        <section className="workspace-card provider-list-card">
          <div className="panel-heading"><span className="panel-step">02</span><div><h2>المزودات الجاهزة</h2><p>اختبر الاتصال من غير ما تشوف أو تنسخ المفتاح.</p></div></div>
          <div className="provider-list">{providers.length ? providers.map((provider) => <div className="provider-row" key={provider.id}><div className="provider-logo"><PlugZap /></div><div><strong>{provider.label}</strong><small>{provider.provider === "ssh-gateway" ? "SSH Gateway" : provider.provider} · {provider.model}</small>{provider.provider === "ssh-gateway" && <small dir="ltr">{provider.baseUrl}</small>}</div><span className="ready-dot">{testedIds.has(provider.id) ? <><CheckCircle2 /> الاختبار نجح</> : "محفوظ — اختبر الاتصال"}</span><Button variant="outline" size="sm" onClick={() => testProvider(provider.id)} disabled={Boolean(testing)}>{testing === provider.id ? <Loader2 className="spin" /> : <PlugZap />} اختبار</Button><button className="icon-button" onClick={() => removeProvider(provider.id)} aria-label="حذف المزود"><Trash2 /></button></div>) : <div className="empty-state"><KeyRound /><strong>لسه مفيش مزود</strong><p>ضيف مزود ذكاء اصطناعي أو سيرفر تنفيذ من النموذج.</p></div>}</div>
        </section>
      </div>
      {message && <div className="settings-message">{message}</div>}
      <section className="config-section">
        <div className="section-heading"><div><p className="eyebrow">CONFIGURATION PACK</p><h2>ملفات تعريف المكتب</h2></div><p>نزّل القالب، عدّله، وارفعه. كل ملف بيتراجع حسب schema ثابت قبل ما يتخزن.</p></div>
        <div className="config-grid">{CONFIGS.map(([kind, title, description]) => <article key={kind} className="config-card"><FileJson2 /><div><span className={configs[kind] ? "configured" : "pending"}>{configs[kind] ? "مفعّل" : "اختياري"}</span><h3>{title}</h3><p>{description}</p></div><div className="config-actions"><a href={`/examples/${kind}.json`} download><Download /> القالب</a><FilePicker compact label={`رفع ${title}`} accept="application/json,.json" onChange={(event) => uploadConfig(kind, event)} /></div></article>)}</div>
      </section>
    </div>
  );
}
