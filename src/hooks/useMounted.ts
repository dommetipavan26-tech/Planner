import { useEffect, useState } from 'react';

/**
 * False during a server render and during the browser's first render, true from
 * the first effect onwards.
 *
 * That two-phase shape is the point: server and first client render agree, so
 * hydration matches, and anything that can only be known in a browser — a device
 * id, a stored preference — appears immediately afterwards.
 */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}
