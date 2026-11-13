import { useEffect, useLayoutEffect } from 'react';

/**
 * `useEffect` on the server, `useLayoutEffect` in the browser.
 *
 * React logs a warning when a layout effect runs during a server render because
 * there is no layout to measure. The behaviour we actually want — run before the
 * browser paints, do nothing on the server — is exactly this swap.
 */
export const useIsoLayoutEffect =
  typeof window === 'undefined' ? useEffect : useLayoutEffect;
