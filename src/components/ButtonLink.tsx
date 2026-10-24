import { Link } from "react-router";

// The two kinds of action on the site. Each screen has at most one solid
// "primary" button; everything else is an underlined text link.

/** The one solid button on a screen: spruce, square-ish 4px corners, no shadow. */
export const primaryButton =
  "inline-flex min-h-14 items-center justify-center rounded-[4px] bg-spruce px-[26px] text-body font-bold text-white no-underline transition-colors hover:bg-spruce-deep disabled:cursor-not-allowed disabled:opacity-70";

/** An underlined spruce text link (or a button that looks like one), at least 48px tall. */
export const textLink =
  "inline-flex min-h-12 items-center text-body font-semibold text-spruce underline decoration-2 underline-offset-4 hover:text-spruce-deep hover:decoration-[3px] disabled:cursor-not-allowed disabled:opacity-70";

export default function ButtonLink({
  to,
  variant = "primary",
  children,
}: {
  to: string;
  variant?: "primary" | "text";
  children: React.ReactNode;
}) {
  return (
    <Link to={to} className={variant === "primary" ? primaryButton : textLink}>
      {children}
    </Link>
  );
}
