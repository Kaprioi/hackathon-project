import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router";
import ErrorBoundary from "./components/ErrorBoundary";
import "./index.css";
import { startDisplaySettings } from "./lib/displaySettings";
import CareProfilePage from "./pages/CareProfilePage";
import DashboardPage from "./pages/DashboardPage";
import HomePage from "./pages/HomePage";
import LoginPage from "./pages/LoginPage";
import NotFoundPage from "./pages/NotFoundPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";

// Phone Tracker: loaded only when someone opens /tracker, so the homepage stays fast.
const TrackerPage = lazy(() => import("./tracker/TrackerPage.tsx"));

// Text size, motion, dark mode and contrast, as this browser asked for them, before anything is drawn.
startDisplaySettings();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* Shows "Something went wrong" instead of a blank page if anything crashes. */}
    <ErrorBoundary>
      <BrowserRouter>
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
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/profile" element={<CareProfilePage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
);
