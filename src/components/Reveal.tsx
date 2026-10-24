import { useEffect, useLayoutEffect, useRef, useState } from "react";

// Gently fades and slides its contents into place: straight away if they are on screen when
// the page opens, otherwise as they scroll into view. When they scroll off the screen again
// they ease back out, ready to arrive again next time they come into view.
//
// - `stagger`: wrap a list (or a column of blocks) and each item arrives a moment after the one before.
// - `cards`: with `stagger`, the items also grow slightly, gain a soft shadow and lift on hover.
// - `pop`: for illustrations, which grow into place with a small, gentle overshoot.
// - `delay`: wait this many milliseconds before arriving (for side-by-side blocks).
// - `once`: arrive once and then stay put, never easing out (for the top of a page).
//
// Content is only ever hidden while it is off screen or at the very bottom edge. People who ask
// their device for less motion, and browsers without IntersectionObserver, see everything at
// once, with no movement. The styles live in index.css, under "Reveal on scroll".
type Phase = "waiting" | "entering" | "done" | "leaving";

// Long enough for the slowest staggered item to finish arriving.
const ENTRANCE_MS = 1600;

export default function Reveal({
  children,
  stagger = false,
  cards = false,
  pop = false,
  delay = 0,
  once = false,
}: {
  children: React.ReactNode;
  stagger?: boolean;
  cards?: boolean;
  pop?: boolean;
  delay?: number;
  once?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>("done");
  const arrive = () => setPhase((p) => (p === "waiting" || p === "leaving" ? "entering" : p));
  const leave = () => setPhase((p) => (p === "entering" || p === "done" ? "leaving" : p));

  // A layout effect runs before the browser paints, so content never flashes before hiding.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !("IntersectionObserver" in window)) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    setPhase("waiting");

    // Already on screen when the page opens? Arrive straight away. Waiting two frames makes
    // sure the hidden starting point is painted first, so the movement is visible.
    let frame = 0;
    if (el.getBoundingClientRect().top < window.innerHeight) {
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(arrive);
      });
    }

    // Arrive once the block is a little way up the screen, and only leave once it is fully off
    // the top or nearly off the bottom. The gap between the two lines stops it flickering at the edge.
    const enter = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && arrive(), {
      rootMargin: "0px 0px -10% 0px",
    });
    const exit = new IntersectionObserver((entries) => entries.every((e) => !e.isIntersecting) && leave(), {
      rootMargin: "0px 0px -4% 0px",
    });
    enter.observe(el);
    if (!once) exit.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      enter.disconnect();
      exit.disconnect();
    };
  }, [once]);

  // Once everything has arrived, drop the entrance delays so hover effects respond at once.
  useEffect(() => {
    if (phase !== "entering") return;
    const timer = setTimeout(() => setPhase("done"), ENTRANCE_MS + delay);
    return () => clearTimeout(timer);
  }, [phase, delay]);

  const classes = [
    stagger ? "reveal-stagger" : "reveal",
    cards && "reveal-cards",
    pop && "reveal-pop",
    phase === "waiting" && "reveal-waiting",
    phase === "leaving" && "reveal-leaving",
    phase === "done" && "reveal-done",
  ];

  return (
    <div
      ref={ref}
      className={classes.filter(Boolean).join(" ")}
      style={delay && phase === "entering" ? { transitionDelay: `${delay}ms` } : undefined}
      // A keyboard user tabbing into hidden content should see it straight away.
      onFocus={arrive}
    >
      {children}
    </div>
  );
}
