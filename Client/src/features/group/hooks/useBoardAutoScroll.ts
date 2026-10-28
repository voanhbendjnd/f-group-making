import { useCallback, useEffect, useRef } from 'react';

/** Scroll on animation frames, including when the pointer is held still near an edge. */
export function useBoardAutoScroll() {
  const boardRef = useRef<HTMLDivElement>(null);
  const frame = useRef<number | null>(null);
  const point = useRef<{ x: number; y: number } | null>(null);
  const vertical = useRef<HTMLElement | null>(null);
  const cachedBoardBounds = useRef<DOMRect | null>(null);
  const cachedVerticalBounds = useRef<DOMRect | null>(null);
  const lastBoundsCheck = useRef<number>(0);

  const stop = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    point.current = null;
    vertical.current = null;
    cachedBoardBounds.current = null;
    cachedVerticalBounds.current = null;
  }, []);

  const start = useCallback(() => {
    if (frame.current !== null) return;
    let last = performance.now();

    const velocity = (position: number, low: number, high: number, edge: number) => {
      if (position < low - 24 || position > high + 24) return 0;
      if (position < low + edge) return -Math.min(1, (low + edge - position) / edge);
      if (position > high - edge) return Math.min(1, (position - high + edge) / edge);
      return 0;
    };

    const tick = (time: number) => {
      const scale = Math.min(32, time - last) / 16.67;
      last = time;

      if (point.current && boardRef.current) {
        // Refresh bounding rects periodically or if not cached, avoiding per-frame layout thrashing
        if (!cachedBoardBounds.current || time - lastBoundsCheck.current > 250) {
          cachedBoardBounds.current = boardRef.current.getBoundingClientRect();
          if (vertical.current) {
            cachedVerticalBounds.current = vertical.current.getBoundingClientRect();
          }
          lastBoundsCheck.current = time;
        }

        const bounds = cachedBoardBounds.current;
        let deltaX = 0;
        let deltaY = 0;

        if (point.current.y >= bounds.top - 24 && point.current.y <= bounds.bottom + 24) {
          deltaX = velocity(point.current.x, bounds.left, bounds.right, 72) * 20 * scale;
        }

        if (vertical.current && cachedVerticalBounds.current) {
          const box = cachedVerticalBounds.current;
          deltaY = velocity(point.current.y, box.top, box.bottom, 48) * 14 * scale;
        }

        // Apply scroll mutations together
        if (deltaX !== 0) {
          boardRef.current.scrollLeft += deltaX;
        }
        if (deltaY !== 0 && vertical.current) {
          vertical.current.scrollTop += deltaY;
        }
      }

      frame.current = requestAnimationFrame(tick);
    };

    frame.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    const move = (event: DragEvent) => {
      // Some browsers coalesce dragover at column boundaries; source drag/dragenter
      // keep the edge position current. Firefox may emit source drag at (0, 0).
      if (event.type === 'drag' && !event.clientX && !event.clientY) return;
      point.current = { x: event.clientX, y: event.clientY };

      // Fast event.target check - avoid document.elementFromPoint forced synchronous reflow
      const targetEl = event.target as HTMLElement | null;
      if (targetEl && targetEl.closest) {
        const scrollable = targetEl.closest<HTMLElement>('[data-board-scroll]');
        if (scrollable !== vertical.current) {
          vertical.current = scrollable;
          cachedVerticalBounds.current = scrollable ? scrollable.getBoundingClientRect() : null;
        }
      }
    };

    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') stop();
    };

    document.addEventListener('dragover', move, true);
    document.addEventListener('dragenter', move, true);
    document.addEventListener('drag', move, true);
    document.addEventListener('drop', stop, true);
    document.addEventListener('dragend', stop, true);
    document.addEventListener('keydown', escape);
    document.addEventListener('keyup', escape);
    window.addEventListener('blur', stop);

    return () => {
      stop();
      document.removeEventListener('dragover', move, true);
      document.removeEventListener('dragenter', move, true);
      document.removeEventListener('drag', move, true);
      document.removeEventListener('drop', stop, true);
      document.removeEventListener('dragend', stop, true);
      document.removeEventListener('keydown', escape);
      window.removeEventListener('blur', stop);
      document.removeEventListener('keyup', escape);
    };
  }, [stop]);

  return { boardRef, startAutoScroll: start, stopAutoScroll: stop };
}
