"use client";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type PremiumSelectOption = {
  value: string;
  label: string;
  meta?: string;
};

type PremiumSelectProps = {
  name?: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  placeholder: string;
  ariaLabel: string;
  groupLabel?: string;
  options: PremiumSelectOption[];
  disabled?: boolean;
};

export function PremiumSelect({
  name,
  value,
  defaultValue,
  onValueChange,
  placeholder,
  ariaLabel,
  groupLabel = "الاختيارات المتاحة",
  options,
  disabled,
}: PremiumSelectProps) {
  return (
    <Select
      name={name}
      value={value}
      defaultValue={defaultValue}
      onValueChange={onValueChange}
      disabled={disabled}
      dir="rtl"
    >
      <SelectTrigger className="premium-select-trigger" aria-label={ariaLabel}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent
        position="popper"
        align="start"
        sideOffset={8}
        className="premium-select-content"
      >
        <SelectGroup>
          <SelectLabel className="premium-select-label">{groupLabel}</SelectLabel>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value} className="premium-select-option">
              <span className="premium-option-copy">
                <strong>{option.label}</strong>
                {option.meta && <small>{option.meta}</small>}
              </span>
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
