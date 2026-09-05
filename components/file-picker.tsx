"use client";

import { type ChangeEvent, useEffect, useRef, useState } from "react";
import { FileCheck2, Upload } from "lucide-react";
import { cn } from "@/lib/utils";

type FilePickerProps = {
  label: string; accept?: string; disabled?: boolean; compact?: boolean;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void | Promise<void>;
};

export function FilePicker({ label, accept, disabled, compact, onChange }: FilePickerProps) {
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const form = input.current?.form;
    const reset = () => setFileName("");
    form?.addEventListener("reset", reset);
    return () => form?.removeEventListener("reset", reset);
  }, []);
  async function select(event: ChangeEvent<HTMLInputElement>) {
    const element = event.currentTarget;
    const file = element.files?.[0];
    if (!file) return;
    setFileName(file.name); setBusy(true);
    try { await onChange(event); }
    finally {
      if (!element.files?.length) setFileName("");
      setBusy(false);
    }
  }
  return (
    <div className={cn("file-picker", compact && "file-picker-compact")} data-disabled={disabled || busy || undefined}>
      <input ref={input} type="file" accept={accept} aria-label={label} disabled={disabled || busy} onChange={select} />
      <span className="file-picker-button" aria-hidden="true">{fileName ? <FileCheck2 /> : <Upload />}{busy ? "بنقرأ الملف…" : compact ? "رفع ملف" : "اختار ملف"}</span>
      {!compact && <span className="file-picker-name" title={fileName || undefined} aria-live="polite">{fileName || "لسه مفيش ملف مختار"}</span>}
    </div>
  );
}
