import { useId, useState } from "react";
import { ERROR_RED } from "./AuthLayout";

// The box style shared by every text field: 56px tall, a 2px ink border, 20px text.
export const inputBox = "min-h-14 w-full min-w-0 rounded-[4px] border-2 bg-white px-4 text-[1.1111rem] text-ink";

// A big, clearly labelled text box. Hints and problems are read out with it.
// `after` sits to the right of the box, like the password field's "Show" button.
export function TextField({
  label,
  hint,
  error,
  after,
  ...inputProps
}: {
  label: string;
  hint?: string;
  error?: string;
  after?: React.ReactNode;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="font-bold">
        {label}
      </label>
      {hint && (
        <p id={hintId} className="text-muted">
          {hint}
        </p>
      )}
      <div className="flex gap-2">
        <input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`${inputBox} ${error ? "border-alert" : "border-ink"}`}
          {...inputProps}
        />
        {after}
      </div>
      {error && (
        <p id={errorId} className={`font-bold ${ERROR_RED}`}>
          {error}
        </p>
      )}
    </div>
  );
}

// A password box with a separate "Show" button beside it.
export function PasswordField(props: Omit<React.ComponentProps<typeof TextField>, "type" | "after">) {
  const [visible, setVisible] = useState(false);
  return (
    <TextField
      {...props}
      type={visible ? "text" : "password"}
      after={
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          className="min-h-14 shrink-0 rounded-[4px] border-2 border-ink bg-white px-4 font-bold text-ink hover:bg-stone"
        >
          {visible ? "Hide" : "Show"}
        </button>
      }
    />
  );
}
