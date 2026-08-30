import { CircleHelp } from "lucide-react";
import type { InputHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

export const inputClassName =
  "min-h-12 w-full rounded-[var(--radius-control)] border border-border bg-surface px-3.5 text-foreground shadow-[0_1px_2px_oklch(0_0_0/0.035)] transition-colors placeholder:text-muted/65 hover:border-muted/45 focus:border-focus";

interface FieldProps {
  children: ReactNode;
  htmlFor: string;
  label: string;
  hint?: string;
  optional?: boolean;
}

export function Field({
  children,
  hint,
  htmlFor,
  label,
  optional = false,
}: FieldProps) {
  return (
    <div className="grid gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <label className="font-bold leading-tight" htmlFor={htmlFor}>
          {label}
        </label>
        {optional ? <span className="text-xs text-muted">If known</span> : null}
      </div>
      {children}
      {hint ? <p className="text-sm leading-snug text-muted">{hint}</p> : null}
    </div>
  );
}

interface NumberFieldProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type"
> {
  prefix?: string;
}

export function NumberField({ className, prefix, ...props }: NumberFieldProps) {
  return (
    <div className="relative">
      {prefix ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
        >
          {prefix}
        </span>
      ) : null}
      <input
        className={cn(inputClassName, prefix && "pl-7", className)}
        inputMode="decimal"
        type="number"
        {...props}
      />
    </div>
  );
}

interface YesNoFieldProps {
  label: string;
  name: string;
  onChange: (value: boolean) => void;
  value: boolean | null;
  hint?: string;
}

export function YesNoField({
  hint,
  label,
  name,
  onChange,
  value,
}: YesNoFieldProps) {
  return (
    <fieldset className="grid gap-2">
      <legend className="font-bold leading-tight">{label}</legend>
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: "Yes", value: true },
          { label: "No", value: false },
        ].map((option) => (
          <label
            className={cn(
              "flex min-h-12 cursor-pointer items-center justify-center rounded-[var(--radius-control)] border bg-surface px-4 font-bold transition-colors",
              value === option.value
                ? "border-primary bg-primary-soft text-primary"
                : "border-border hover:border-muted/50",
            )}
            key={option.label}
          >
            <input
              checked={value === option.value}
              className="sr-only"
              name={name}
              onChange={() => onChange(option.value)}
              type="radio"
            />
            {option.label}
          </label>
        ))}
      </div>
      {hint ? (
        <p className="flex gap-1.5 text-sm leading-snug text-muted">
          <CircleHelp aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {hint}
        </p>
      ) : null}
    </fieldset>
  );
}
