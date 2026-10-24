import { Component } from "react";
import { useLanguage } from "../i18n/useLanguage";
import { buttonVariants } from "./ButtonLink";

// Wraps the whole app. If any page crashes while drawing itself, people see a
// friendly message with a reload button instead of a blank white page.
// (React only lets a class component do this.)

export default class ErrorBoundary extends Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error("The page crashed:", error);
  }

  render() {
    return this.state.failed ? <Crashed /> : this.props.children;
  }
}

// The friendly message itself, in the chosen language.
function Crashed() {
  const { t } = useLanguage();
  return (
    <div role="alert" className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="text-4xl font-extrabold">{t("Something went wrong")}</h1>
      <p className="text-xl text-muted">{t("Sorry, this page stopped working. Reloading usually fixes it.")}</p>
      <div className="flex flex-wrap justify-center gap-3">
        <button type="button" onClick={() => window.location.reload()} className={buttonVariants.primary}>
          {t("Reload")}
        </button>
        <a href="/" className={buttonVariants.outline}>
          {t("Go to the homepage")}
        </a>
      </div>
    </div>
  );
}
