import { useEffect } from "react";
import { useLocation, useNavigationType } from "react-router";

/**
 * Starts every new page at the top. Without this, clicking a link at the bottom of
 * one page (like "Need help?" in the footer) opened the next page scrolled down too.
 * The browser's own Back and Forward buttons still return you to where you were,
 * and links to a spot on a page (like "#family-title") still go to that spot.
 */
export default function ScrollToTop() {
  const { pathname, hash } = useLocation();
  const navigationType = useNavigationType();

  useEffect(() => {
    if (navigationType === "POP" || hash) return;
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname, hash, navigationType]);

  return null;
}
