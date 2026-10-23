import { Link } from "react-router";

type Variant = "primary" | "outline" | "inverse" | "inverse-outline";

const base =
  "inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl border-[3px] px-7 text-lg font-extrabold no-underline transition-colors";

const variants: Record<Variant, string> = {
  // Big purple button with a soft "press" shadow.
  primary: "border-brand bg-brand text-white shadow-[0_6px_0_var(--color-brand-dark)] hover:bg-brand-dark",
  outline: "border-brand bg-white text-brand hover:bg-lilac",
  // For use on the purple call-to-action card.
  inverse: "border-white bg-white text-brand shadow-[0_6px_0_var(--color-brand-dark)] hover:bg-lilac",
  "inverse-outline": "border-white bg-transparent text-white hover:bg-brand-dark",
};

export default function ButtonLink({
  to,
  variant = "primary",
  children,
}: {
  to: string;
  variant?: Variant;
  children: React.ReactNode;
}) {
  return (
    <Link to={to} className={`${base} ${variants[variant]}`}>
      {children}
    </Link>
  );
}
