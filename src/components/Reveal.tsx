import { useEffect, useLayoutEffect, useRef, useState } from "react";

// Gently fades and slides its contents into place: straight away if they are on screen when
// the page opens, otherwise the first time they scroll into view.
//
// - `stagger`: wrap a list (or a column of blocks) and each item arrives a moment after the one before.
// - `cards`: with `stagger`, the items also grow slightly, gain a soft shadow and lift on hover.
// - `pop`: for illustrations, which grow into place with a small, gentle overshoot.
// - `delay`: wait this many milliseconds before arriving (for side-by-side blocks).
//
// Content is only ever hidden for a moment before it arrives. People who ask their device for
// less motion, and browsers without IntersectionObserver, see everything at once, with no movement.
// The styles live in index.css, under "Reveal on scroll".
type Phase = "waiting" | "entering" | "done";

// Long enough for the slowest staggered item to finish arriving.
const ENTRANCE_MS = 1600;

export default function Reveal({
  children,
  stagger = false,
  cards = false,
  pop = false,
  delay = 0,
}: {
  children: React.ReactNode;
  stagger?: boolean;
  cards?: boolean;
  pop?: boolean;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>("done");
  const arrive = () => setPhase((p) => (p === "waiting" ? "entering" : p));

  // A layout effect runs before the browser paints, so content never flashes before hiding.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !("IntersectionObserver" in window)) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    setPhase("waiting");

    // Already on screen when the page opens? Arrive straight away. Waiting two frames makes
    // sure the hidden starting point is painted first, so the movement is visible.
    if (el.getBoundingClientRect().top < window.innerHeight) {
      let frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(arrive);
      });
      return () => cancelAnimationFrame(frame);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          arrive();
          observer.disconnect();
        }
      },
      // Start once the top of the block is a little way up the screen. The huge top margin
      // counts everything above the screen as "in view", so jumping past a block shows it too.
      { rootMargin: "100000px 0px -10% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

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
    phase === "done" && "reveal-done",
  ];

  return (
    <div
      ref={ref}
      className={classes.filter(Boolean).join(" ")}
      style={delay && phase !== "done" ? { transitionDelay: `${delay}ms` } : undefined}
      // A keyboard user tabbing into hidden content should see it straight away.
      onFocus={arrive}
    >
      {children}
    </div>
  );
}
