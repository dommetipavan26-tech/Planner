import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type AnchorHTMLAttributes,
  type ReactNode,
} from 'react';

/**
 * A 60-line router. Five routes, no dependency, path-based URLs with a SPA
 * rewrite in vercel.json. Nothing here needs the weight of react-router.
 */

export interface RouteMatch {
  name: 'corridors' | 'corridor' | 'trips' | 'carriers' | 'requests' | 'notfound';
  code?: string;
}

const CORRIDOR_PREFIX = '/corridor/';

export function matchPath(pathname: string): RouteMatch {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/' || path === '/corridors') return { name: 'corridors' };
  if (path === '/trips') return { name: 'trips' };
  if (path === '/carriers') return { name: 'carriers' };
  if (path === '/requests') return { name: 'requests' };
  if (path.startsWith(CORRIDOR_PREFIX)) {
    const code = path.slice(CORRIDOR_PREFIX.length);
    if (code.length > 0) return { name: 'corridor', code: decodeURIComponent(code) };
  }
  return { name: 'notfound' };
}

export function corridorPath(code: string): string {
  return `${CORRIDOR_PREFIX}${encodeURIComponent(code)}`;
}

function currentPath(): string {
  if (typeof window === 'undefined') return '/';
  return window.location.pathname + window.location.search;
}

interface RouterApi {
  path: string;
  route: RouteMatch;
  navigate: (to: string, opts?: { replace?: boolean }) => void;
}

const RouterContext = createContext<RouterApi | null>(null);

export function RouterProvider({ children }: { children: ReactNode }) {
  const [path, setPath] = useState<string>(currentPath);

  useEffect(() => {
    const onPop = () => setPath(currentPath());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback((to: string, opts?: { replace?: boolean }) => {
    if (typeof window === 'undefined') return;
    const target = to.startsWith('/') ? to : `/${to}`;
    if (target === window.location.pathname + window.location.search) return;
    if (opts?.replace) window.history.replaceState(null, '', target);
    else window.history.pushState(null, '', target);
    setPath(target);
  }, []);

  const value = useMemo<RouterApi>(
    () => ({ path, route: matchPath(path), navigate }),
    [path, navigate],
  );

  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function useRouter(): RouterApi {
  const ctx = useContext(RouterContext);
  if (!ctx) throw new Error('useRouter must be used inside <RouterProvider>');
  return ctx;
}

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  to: string;
  replace?: boolean;
};

/** Anchor that keeps cmd-click, middle-click and href semantics intact. */
export function Link({ to, replace, onClick, children, ...rest }: LinkProps) {
  const { navigate } = useRouter();
  return (
    <a
      href={to}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        if (event.button !== 0) return;
        const target = rest.target;
        if (target && target !== '_self') return;
        event.preventDefault();
        navigate(to, replace ? { replace: true } : undefined);
      }}
      {...rest}
    >
      {children}
    </a>
  );
}

/** Scrolls to top on route change, and to the anchor when one is present. */
export function ScrollToTop() {
  const { path } = useRouter();
  useEffect(() => {
    const hash = typeof window === 'undefined' ? '' : window.location.hash;
    if (hash) {
      const el = document.querySelector(hash);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
    }
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [path]);
  return null;
}
