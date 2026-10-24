import { useLayoutEffect, useRef, useState } from "react";

// Gently fades and slides its contents into place the first time they scroll into view.
//
// - `stagger`: wrap a list (<ul>/<ol>) and each item slides in a moment after the one before.
// - `delay`: wait this many milliseconds before sliding in (for side-by-side blocks).
// - `appear`: slide in straight away when the page opens, instead of waiting for a scroll.
//
// Content is only ever hidden while it is off screen and the browser can tell us when it
// arrives. People who ask their device for less motion, browsers without IntersectionObserver,
// and anything already on screen when the page opens are shown immediately, with no movement.
// The styles live in index.css, under "Reveal on scroll".
export default function Reveal({
  children,
  stagger = false,
  delay = 0,
  appear = false,
}: {
  children: React.ReactNode;
  stagger?: boolean;
  delay?: number;
  appear?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [waiting, setWaiting] = useState(false);

  // A layout effect runs before the browser paints, so off-screen content never flashes.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !("IntersectionObserver" in window)) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    if (appear) {
      setWaiting(true);
      // Wait two frames so the hidden state is painted before sliding in.
      let frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => setWaiting(false));
      });
      return () => cancelAnimationFrame(frame);
    }

    // Already on screen (or scrolled past)? Leave it as it is.
    if (el.getBoundingClientRect().top < window.innerHeight) return;

    setWaiting(true);
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setWaiting(false);
          observer.disconnect();
        }
      },
      // Start once the top of the block is a little way up the screen. The huge top margin
      // counts everything above the screen as "in view", so jumping past a block shows it too.
      { rootMargin: "100000px 0px -10% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [appear]);

  return (
    <div
      ref={ref}
      className={`${stagger ? "reveal-stagger" : "reveal"}${waiting ? " reveal-waiting" : ""}`}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
      // A keyboard user tabbing into hidden content should see it straight away.
      onFocus={() => setWaiting(false)}
    >
      {children}
    </div>
  );
}
