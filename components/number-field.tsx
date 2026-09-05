"use client";

import { useEffect, useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";

type NumberFieldProps = {
  id: string; name: string; label: string; defaultValue: number;
  min: number; max: number; required?: boolean; disabled?: boolean;
};

export function NumberField({ id, name, label, defaultValue, min, max, required, disabled }: NumberFieldProps) {
  const [value, setValue] = useState(String(defaultValue));
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const form = input.current?.form;
    const reset = () => setValue(String(defaultValue));
    form?.addEventListener("reset", reset);
    return () => form?.removeEventListener("reset", reset);
  }, [defaultValue]);
  const numeric = value === "" ? null : Number(value);
  function step(direction: -1 | 1) {
    const current = numeric !== null && Number.isFinite(numeric) ? numeric : min - direction;
    setValue(String(Math.min(max, Math.max(min, Math.trunc(current) + direction))));
  }
  return (
    <div className="number-field" data-disabled={disabled || undefined}>
      <Input ref={input} id={id} name={name} type="number" dir="ltr" inputMode="numeric"
        min={min} max={max} step={1} required={required} disabled={disabled}
        value={value} onChange={(event) => setValue(event.target.value)} aria-label={label} />
      <div className="number-field-actions" dir="ltr">
        <button type="button" onClick={() => step(-1)} aria-label={`تقليل ${label}`} aria-controls={id}
          disabled={disabled || (numeric !== null && numeric <= min)}><Minus aria-hidden="true" /></button>
        <button type="button" onClick={() => step(1)} aria-label={`زيادة ${label}`} aria-controls={id}
          disabled={disabled || (numeric !== null && numeric >= max)}><Plus aria-hidden="true" /></button>
      </div>
    </div>
  );
}
