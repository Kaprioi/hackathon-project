import { useLocation, useNavigate } from "react-router";
import { useLanguage } from "../i18n/useLanguage";

/**
 * A big "Go back" button, so nobody has to find the browser's own back button.
 * Goes to the page you came from, or to the homepage if this is the first page
 * you opened (for example from a link in an email).
 */
export default function BackButton({ className = "" }: { className?: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useLanguage();
  // React Router gives the very first page in this tab the key "default".
  const cameFromThisSite = location.key !== "default";

  return (
    <button
      type="button"
      onClick={() => (cameFromThisSite ? navigate(-1) : navigate("/"))}
      className={`group inline-flex min-h-12 items-center gap-2 rounded-2xl border-[3px] border-brand bg-surface px-4 text-lg font-extrabold text-brand transition-all duration-200 hover:-translate-y-0.5 hover:bg-lilac ${className}`}
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 20 20"
        aria-hidden="true"
        className="transition-transform duration-200 group-hover:-translate-x-1"
      >
        <path
          d="M16 10H5m4-4-4 4 4 4"
          stroke="currentColor"
          strokeWidth="2.5"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {t("Go back")}
    </button>
  );
}
