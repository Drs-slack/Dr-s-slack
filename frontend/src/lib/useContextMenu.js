import { useCallback, useState } from 'react';

// Shared open/close state for the app-wide right-click context menu. Only one
// menu is ever open at a time — `id` is an opaque caller-chosen key (e.g.
// `note-42`) used to highlight the specific row/card the menu applies to.
export function useContextMenu() {
  const [menu, setMenu] = useState(null); // { x, y, id, items } | null

  const openMenu = useCallback((e, id, items) => {
    e.preventDefault?.();
    const point = e.touches?.[0] || e.changedTouches?.[0] || e;
    setMenu({ x: point.clientX, y: point.clientY, id, items });
  }, []);

  const closeMenu = useCallback(() => setMenu(null), []);

  return { menu, openMenu, closeMenu };
}
