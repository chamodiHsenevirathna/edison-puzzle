import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useEffect, useRef } from "react";

const NAV: Array<[string, string]> = [
  ["/play", "Puzzle"],
  ["/explore", "Algorithm"],
  ["/compare", "Compare"],
  ["/solutions", "Solutions"],
  ["/challenges", "Challenges"],
  ["/create", "Create"],
];

export function Logo() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <g fill="none" style={{ stroke: "var(--cobalt)" }} strokeWidth="1.6">
        <rect x="3" y="3" width="15" height="11" style={{ fill: "var(--amber-fill)" }} />
        <rect x="18" y="3" width="11" height="17" />
        <rect x="3" y="14" width="15" height="15" />
        <rect x="18" y="20" width="11" height="9" style={{ fill: "var(--amber-fill)" }} />
      </g>
    </svg>
  );
}

export function Layout() {
  const { pathname } = useLocation();
  const main = useRef<HTMLElement>(null);
  const first = useRef(true);
  // Move focus to the page on route change so keyboard and screen-reader users start at the content.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    main.current?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [pathname]);
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <div className="container">
          <NavLink to="/" className="brand" aria-label="Edison Puzzle home">
            <Logo />
            <span>Edison Puzzle</span>
          </NavLink>
          <nav className="nav" aria-label="Main">
            {NAV.map(([to, label]) => (
              <NavLink key={to} to={to}>
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main id="main" ref={main} tabIndex={-1} style={{ outline: "none" }}>
        <div className="container">
          <Outlet />
        </div>
      </main>
      <footer className="site-footer">
        <div className="container">
          <dl className="title-block">
            <div>
              <dt>Drawing</dt>
              <dd>Edison Puzzle</dd>
            </div>
            <div>
              <dt>Original puzzle</dt>
              <dd>56 × 56 board</dd>
            </div>
            <div>
              <dt>Original pieces</dt>
              <dd>12 rectangles · 3,136 cells</dd>
            </div>
            <div>
              <dt>Data</dt>
              <dd>Progress stays in this browser</dd>
            </div>
            <div>
              <dt>Links</dt>
              <dd>
                <NavLink to="/settings">Preferences</NavLink>
              </dd>
            </div>
          </dl>
        </div>
      </footer>
    </>
  );
}
