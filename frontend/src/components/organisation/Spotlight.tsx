import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

const sameBox = (a: Box | null, b: Box) => !!a && a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height;

/**
 * Draws attention to one element of the page (found with a CSS selector): a ring around it
 * that follows it when the page scrolls or changes. The element stays what it is: it can be
 * clicked as always, and nothing else on the page is covered or blocked.
 *
 * When the element isn't on the page (yet), nothing is drawn.
 */
export function Spotlight({ selector, label }: { selector: string; label?: string }) {
  const [box, setBox] = useState<Box | null>(null);

  useEffect(() => {
    let broughtIntoView = false;
    const measure = () => {
      const element = document.querySelector(selector);
      const rect = element?.getBoundingClientRect();
      if (!element || !rect || (rect.width === 0 && rect.height === 0)) {
        setBox(null);
        return;
      }
      if (!broughtIntoView) {
        broughtIntoView = true;
        // Brought to the upper part of the screen, clear of the guide panel in the bottom corner.
        // Something taller than that (a whole table) only has its top brought into view.
        const upperPart = window.innerHeight * 0.55;
        const visible = rect.top >= 80 && Math.min(rect.bottom, rect.top + 160) <= upperPart;
        if (!visible) window.scrollBy({ top: rect.top - window.innerHeight * 0.28, behavior: 'smooth' });
      }
      const next = { top: Math.round(rect.top), left: Math.round(rect.left), width: Math.round(rect.width), height: Math.round(rect.height) };
      setBox((current) => (sameBox(current, next) ? current : next));
    };
    measure();
    // The pages load their content in steps and have no single "ready" moment: look again regularly
    const timer = window.setInterval(measure, 250);
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [selector]);

  if (!box) return null;
  const pad = 6;
  return createPortal(
    <div
      aria-hidden="true"
      data-spotlight={selector}
      className="fixed pointer-events-none z-30"
      style={{ top: box.top - pad, left: box.left - pad, width: box.width + pad * 2, height: box.height + pad * 2 }}
    >
      <div className="absolute inset-0 rounded-2xl ring-4 ring-primary-400/80 shadow-[0_0_0_6px_rgba(168,85,247,0.18)] motion-safe:animate-pulse" />
      {label && (
        <span className="absolute -top-3 left-3 px-2 py-0.5 rounded-full bg-primary-600 text-white text-[11px] font-semibold shadow-sm whitespace-nowrap">
          {label}
        </span>
      )}
    </div>,
    document.body
  );
}
