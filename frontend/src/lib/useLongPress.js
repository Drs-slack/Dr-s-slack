import { useCallback, useRef } from 'react';

const LONG_PRESS_MS = 500;
const MOVE_TOLERANCE_PX = 10;

// Touch equivalent of a right-click: hold for LONG_PRESS_MS without moving
// past the tolerance to trigger `onLongPress`. Spread the returned handlers
// onto the same element that has onContextMenu.
export function useLongPress(onLongPress) {
  const timerRef = useRef(null);
  const startRef = useRef({ x: 0, y: 0 });
  const firedRef = useRef(false);

  const clear = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const onTouchStart = useCallback((e) => {
    const t = e.touches[0];
    if (!t) return;
    firedRef.current = false;
    startRef.current = { x: t.clientX, y: t.clientY };
    timerRef.current = setTimeout(() => {
      firedRef.current = true;
      if (navigator.vibrate) navigator.vibrate(10);
      const { x, y } = startRef.current;
      onLongPress({ clientX: x, clientY: y, touches: [{ clientX: x, clientY: y }], preventDefault() {} });
    }, LONG_PRESS_MS);
  }, [onLongPress]);

  const onTouchMove = useCallback((e) => {
    const t = e.touches[0];
    if (!t) return;
    const dx = Math.abs(t.clientX - startRef.current.x);
    const dy = Math.abs(t.clientY - startRef.current.y);
    if (dx > MOVE_TOLERANCE_PX || dy > MOVE_TOLERANCE_PX) clear();
  }, [clear]);

  const onTouchEnd = useCallback((e) => {
    clear();
    if (firedRef.current) e.preventDefault();
  }, [clear]);

  return { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: clear };
}
