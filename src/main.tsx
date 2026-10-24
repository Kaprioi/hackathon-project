import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router";
import "./index.css";
import HomePage from "./pages/HomePage";
import NotFoundPage from "./pages/NotFoundPage";

// Phone Tracker: loaded only when someone opens /tracker, so the homepage stays fast.
const TrackerPage = lazy(() => import("./tracker/TrackerPage.tsx"));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route
          path="/tracker"
          element={
            <Suspense fallback={<p className="p-6 text-xl">Loading the tracker...</p>}>
              <TrackerPage />
            </Suspense>
          }
        />
        {/* The login page is built in a separate task: add <Route path="/login" ... /> here. */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
