import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router";
import ErrorBoundary from "./components/ErrorBoundary";
import ScrollToTop from "./components/ScrollToTop";
import SiteLayout from "./components/SiteLayout";
import { useLanguage } from "./i18n/useLanguage";
import "./index.css";
import { startDisplaySettings } from "./lib/displaySettings";
import HelpPage from "./pages/HelpPage";
import HomePage from "./pages/HomePage";
import LoginPage from "./pages/LoginPage";
import NotFoundPage from "./pages/NotFoundPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";

// Phone Tracker: loaded only when someone opens /tracker, so the homepage stays fast.
const TrackerPage = lazy(() => import("./tracker/TrackerPage.tsx"));
// The signed-in pages load when someone opens them, for the same reason.
const AccountPage = lazy(() => import("./pages/AccountPage"));
const CareProfilePage = lazy(() => import("./pages/CareProfilePage"));
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const GetStartedPage = lazy(() => import("./pages/GetStartedPage"));

// Shown for a moment while a signed-in page loads; looks the same as their own "Loading…".
function PageLoading() {
  const { t } = useLanguage();
  return (
    <SiteLayout>
      <div className="mx-auto flex min-h-screen max-w-2xl items-center justify-center px-6">
        <p className="text-xl text-muted">{t("Loading…")}</p>
      </div>
    </SiteLayout>
  );
}

// Text size, motion and contrast, as this browser asked for them, before anything is drawn.
startDisplaySettings();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* Shows "Something went wrong" instead of a blank page if anything crashes. */}
    <ErrorBoundary>
      <BrowserRouter>
        <ScrollToTop />
        <Routes>
          {/* HomePage is the About Us page. */}
          <Route path="/" element={<HomePage />} />
          <Route
            path="/tracker"
            element={
              <Suspense fallback={<p className="p-6 text-xl">Loading the tracker...</p>}>
                <TrackerPage />
              </Suspense>
            }
          />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route
            path="/dashboard"
            element={
              <Suspense fallback={<PageLoading />}>
                <DashboardPage />
              </Suspense>
            }
          />
          <Route
            path="/profile"
            element={
              <Suspense fallback={<PageLoading />}>
                <CareProfilePage />
              </Suspense>
            }
          />
          <Route
            path="/account"
            element={
              <Suspense fallback={<PageLoading />}>
                <AccountPage />
              </Suspense>
            }
          />
          <Route path="/help" element={<HelpPage />} />
          <Route
            path="/get-started"
            element={
              <Suspense fallback={<PageLoading />}>
                <GetStartedPage />
              </Suspense>
            }
          />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
);
