import type { MouseEvent as ReactMouseEvent } from 'react';

/** Elements that keep their own mouse behaviour: pressing on them never moves the window. */
const INTERACTIVE =
  'button, a, input, textarea, select, option, label, summary, [contenteditable=""], [contenteditable="true"], [role="button"], [role="slider"], [role="switch"], [data-no-drag]';

/** Pixels the pointer must travel before a press becomes a drag, so a plain click never moves the window. */
export const DRAG_THRESHOLD = 4;

export function isInteractive(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(INTERACTIVE) !== null;
}

/** True when the press landed on an element's own scrollbar rather than its content. */
export function onScrollbar(el: Element, clientX: number, clientY: number): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const r = el.getBoundingClientRect();
  const vBar = el.offsetWidth - el.clientWidth;
  const hBar = el.offsetHeight - el.clientHeight;
  return (vBar > 0 && clientX >= r.right - vBar) || (hBar > 0 && clientY >= r.bottom - hBar);
}

/**
 * Lets the user drag the window from any non-interactive spot. The drag starts only after the
 * pointer moves a few pixels, so clicks, double-clicks and controls work exactly as before.
 * `startDragging` hands the move to the OS (Tauri), which handles multiple monitors and DPI.
 */
export function makeDragAnywhere(startDragging: () => Promise<void> | void) {
  return (e: ReactMouseEvent) => {
    if (e.button !== 0 || e.defaultPrevented) return;
    if (isInteractive(e.target) || onScrollbar(e.target as Element, e.clientX, e.clientY)) return;

    const x0 = e.clientX;
    const y0 = e.clientY;
    const cleanup = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', cleanup);
    };
    const move = (m: MouseEvent) => {
      if ((m.buttons & 1) === 0) return cleanup();
      if (Math.abs(m.clientX - x0) < DRAG_THRESHOLD && Math.abs(m.clientY - y0) < DRAG_THRESHOLD) return;
      cleanup();
      window.getSelection()?.removeAllRanges();
      void Promise.resolve(startDragging()).catch(() => {});
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', cleanup);
  };
}
