import { useEffect, useRef, useState } from "react";

function readStored(key, fallback) {
  try {
    const v = parseFloat(localStorage.getItem(key));
    return Number.isFinite(v) && v > 0 && v < 1 ? v : fallback;
  } catch {
    return fallback;
  }
}

function writeStored(key, value) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    /* storage unavailable (private mode, blocked) — proportions just won't persist */
  }
}

/**
 * Drives a two-pane split where the first pane's width is a fraction of the container,
 * exposed as the CSS custom property `--pw`. Pointer dragging writes that property straight
 * to the DOM node (never through React state) so movement is immediate and causes no
 * re-render; React state only carries `aria-valuenow` for assistive tech. Minimum pixel
 * widths are enforced for both panes, and a stored fraction is re-clamped on resize.
 */
export function useSplitPane({ storageKey, initial = 0.42, minPx = 320, minOtherPx = 360 } = {}) {
  const containerRef = useRef(null);
  const [initialFraction] = useState(() => readStored(storageKey, initial));
  const fractionRef = useRef(initialFraction);
  const [valueNow, setValueNow] = useState(Math.round(initialFraction * 100));

  const clamp = (frac) => {
    const el = containerRef.current;
    const w = el?.clientWidth ?? 0;
    if (w <= 0) return frac;
    const minF = minPx / w;
    const maxF = 1 - minOtherPx / w;
    if (minF > maxF) return frac; // not enough room to honour both minimums
    return Math.min(maxF, Math.max(minF, frac));
  };

  const apply = (frac) => {
    fractionRef.current = frac;
    containerRef.current?.style.setProperty("--pw", `${(frac * 100).toFixed(3)}%`);
  };

  const commit = (frac) => {
    apply(frac);
    setValueNow(Math.round(frac * 100));
    writeStored(storageKey, frac);
  };

  const onPointerDown = (e) => {
    const el = containerRef.current;
    if (!el) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    document.body.classList.add("is-resizing");
    const rect = el.getBoundingClientRect();
    const onMove = (ev) => apply(clamp((ev.clientX - rect.left) / rect.width));
    const onUp = () => {
      document.body.classList.remove("is-resizing");
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setValueNow(Math.round(fractionRef.current * 100));
      writeStored(storageKey, fractionRef.current);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const onKeyDown = (e) => {
    const step = e.shiftKey ? 0.06 : 0.02;
    if (e.key === "ArrowLeft") commit(clamp(fractionRef.current - step));
    else if (e.key === "ArrowRight") commit(clamp(fractionRef.current + step));
    else if (e.key === "Home") commit(clamp(0));
    else if (e.key === "End") commit(clamp(1));
    else return;
    e.preventDefault();
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    apply(clamp(fractionRef.current));
    const ro = new ResizeObserver(() => apply(clamp(fractionRef.current)));
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const separatorProps = {
    role: "separator",
    tabIndex: 0,
    "aria-orientation": "vertical",
    "aria-label": "Resize problem and terminal panels",
    "aria-valuenow": valueNow,
    "aria-valuemin": 0,
    "aria-valuemax": 100,
    onPointerDown,
    onKeyDown,
  };

  return {
    containerRef,
    gridStyle: { "--pw": `${(initialFraction * 100).toFixed(3)}%` },
    separatorProps,
  };
}
