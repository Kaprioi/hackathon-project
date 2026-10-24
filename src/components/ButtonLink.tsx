import { Link } from "react-router";

type Variant = "primary" | "outline" | "inverse" | "inverse-outline";

const base =
  "group inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl border-[3px] px-7 text-lg font-extrabold no-underline transition-all duration-200 hover:-translate-y-0.5 active:translate-y-1";

export const buttonVariants: Record<Variant, string> = {
  // Big blue button with a soft "press" shadow.
  primary: `${base} border-brand bg-brand text-on-brand shadow-[0_6px_0_var(--color-brand-dark)] hover:bg-brand-dark hover:shadow-[0_8px_0_var(--color-brand-dark)] active:shadow-[0_2px_0_var(--color-brand-dark)]`,
  outline: `${base} border-brand bg-surface text-brand hover:bg-lilac`,
  // For use on the blue call-to-action card.
  inverse: `${base} border-on-brand bg-surface text-brand shadow-[0_6px_0_var(--color-brand-dark)] hover:bg-lilac`,
  "inverse-outline": `${base} border-on-brand bg-transparent text-on-brand hover:bg-brand-dark`,
};

/** The little arrow on "Get started" buttons. It nudges right on hover. */
export function Arrow() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      aria-hidden="true"
      className="transition-transform duration-200 group-hover:translate-x-1"
    >
      <path
        d="M4 10h11m-4-4 4 4-4 4"
        stroke="currentColor"
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function ButtonLink({
  to,
  variant = "primary",
  arrow = false,
  className = "",
  children,
}: {
  to: string;
  variant?: Variant;
  arrow?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link to={to} className={`${buttonVariants[variant]} ${className}`}>
      {children}
      {arrow && <Arrow />}
    </Link>
  );
}
