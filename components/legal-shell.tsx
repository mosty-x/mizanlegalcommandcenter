"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  Activity,
  BookOpen,
  ChevronLeft,
  LayoutGrid,
  Menu,
  Settings2,
  ShieldCheck,
  X,
} from "lucide-react";
import { useState } from "react";
import { TOOLS } from "@/lib/tool-definitions";
import { cn } from "@/lib/utils";

export function LegalShell({ children, userName }: { children: React.ReactNode; userName: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const nav = [
    { href: "/", label: "لوحة القيادة", icon: LayoutGrid },
    ...TOOLS.map((tool) => ({ href: `/tools/${tool.slug}`, label: tool.shortName, icon: tool.icon })),
    { href: "/settings", label: "الإعداد والتخصيص", icon: Settings2 },
  ];
  return (
    <div className="app-shell" dir="rtl">
      <div className="scanline" aria-hidden="true" />
      <header className="mobile-header">
        <Brand compact />
        <button className="icon-button" onClick={() => setOpen((value) => !value)} aria-label="فتح القائمة">
          {open ? <X /> : <Menu />}
        </button>
      </header>
      {open && <button className="nav-backdrop" aria-label="إغلاق القائمة" onClick={() => setOpen(false)} />}
      <aside className={cn("side-panel", open && "is-open")}>
        <Brand />
        <nav className="main-nav" aria-label="الأدوات الرئيسية">
          <p className="eyebrow px-3">مساحة العمل</p>
          {nav.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className={cn("nav-item", active && "active")}>
                <Icon />
                <span>{item.label}</span>
                {active && <ChevronLeft className="mr-auto" />}
              </Link>
            );
          })}
        </nav>
        <div className="side-footer">
          <div className="security-chip"><ShieldCheck /><span>بيانات مشفّرة · مراجعة بشرية</span></div>
          <div className="user-line">
            <span className="avatar-mark">{userName.trim().slice(0, 1) || "ف"}</span>
            <div><strong>{userName}</strong><small>حساب المكتب</small></div>
            <button className="icon-button" onClick={() => window.dispatchEvent(new Event("mizan:open-guide"))} aria-label="عرض دليل البداية"><BookOpen /></button>
          </div>
        </div>
      </aside>
      <main className="content-panel">{children}</main>
    </div>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className={cn("brand", compact && "compact")}>
      <span className="brand-symbol"><Image src="/mizan-mark.svg" width={39} height={39} alt="" /></span>
      <span><strong>ميزان</strong><small>LEGAL COMMAND</small></span>
      {!compact && <span className="live-mark"><Activity /> LIVE</span>}
    </Link>
  );
}
