import { useId, useState } from "react";
import { ERROR_RED } from "./AuthLayout";

// A big, clearly labelled text box. Hints and problems are read out with it.
export function TextField({
  label,
  hint,
  error,
  ...inputProps
}: {
  label: string;
  hint?: string;
  error?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-xl font-extrabold">
        {label}
      </label>
      {hint && (
        <p id={hintId} className="text-lg text-muted">
          {hint}
        </p>
      )}
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`min-h-14 w-full rounded-2xl border-[3px] bg-surface px-5 text-xl text-ink transition-colors ${
          error ? "border-error" : "border-muted hover:border-brand focus:border-brand"
        }`}
        {...inputProps}
      />
      {error && (
        <p id={errorId} className={`text-lg font-bold ${ERROR_RED}`}>
          {error}
        </p>
      )}
    </div>
  );
}

// A password box with a big "Show password" tick box underneath.
export function PasswordField(props: Omit<React.ComponentProps<typeof TextField>, "type">) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <TextField {...props} type={visible ? "text" : "password"} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-pressed={visible}
        className="inline-flex min-h-12 items-center gap-3 self-start rounded-xl px-1 text-lg font-bold text-brand hover:text-brand-dark"
      >
        <span
          aria-hidden="true"
          className={`grid h-7 w-7 place-items-center rounded-md border-[3px] border-brand ${visible ? "bg-brand text-on-brand" : "bg-surface"}`}
        >
          {visible ? "✓" : ""}
        </span>
        Show password
      </button>
    </div>
  );
}
