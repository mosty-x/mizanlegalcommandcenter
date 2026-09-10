"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";

type NumberFieldProps = {
  id?: string; name?: string; label?: string; defaultValue?: number;
  min: number; max: number; required?: boolean; disabled?: boolean;
  value?: number; onValueChange?: (value:number)=>void; step?:number;
};

export function NumberField({ id:providedId, name, label="القيمة", defaultValue, min, max, required, disabled, value:controlled,onValueChange,step:increment=1 }: NumberFieldProps) {
  const generatedId=useId(),id=providedId??generatedId;
  const [internal, setInternal] = useState(String(defaultValue??min));
  const [editingValue,setEditingValue]=useState<string|null>(null);
  const value=editingValue??(controlled===undefined?internal:String(controlled));
  function setValue(raw:string){setInternal(raw);if(onValueChange&&raw!==""&&Number.isFinite(Number(raw)))onValueChange(Number(raw));}
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const form = input.current?.form;
    const reset = () => setInternal(String(defaultValue??min));
    form?.addEventListener("reset", reset);
    return () => form?.removeEventListener("reset", reset);
  }, [defaultValue,min]);
  const numeric = value === "" ? null : Number(value);
  function step(direction: -1 | 1) {
    const current = numeric !== null && Number.isFinite(numeric) ? numeric : min - direction;
    setEditingValue(null);
    setValue(String(Math.min(max, Math.max(min, Math.round((current + direction*increment)*1000000)/1000000))));
  }
  return (
    <div className="number-field" data-disabled={disabled || undefined}>
      <Input ref={input} id={id} name={name} type="number" dir="ltr" inputMode="numeric"
        min={min} max={max} step={increment} required={required} disabled={disabled}
        value={value} onChange={(event) => {setEditingValue(event.target.value);setValue(event.target.value);}} onBlur={()=>setEditingValue(null)} aria-label={label} />
      <div className="number-field-actions" dir="ltr">
        <button type="button" onClick={() => step(-1)} aria-label={`تقليل ${label}`} aria-controls={id}
          disabled={disabled || (numeric !== null && numeric <= min)}><Minus aria-hidden="true" /></button>
        <button type="button" onClick={() => step(1)} aria-label={`زيادة ${label}`} aria-controls={id}
          disabled={disabled || (numeric !== null && numeric >= max)}><Plus aria-hidden="true" /></button>
      </div>
    </div>
  );
}
