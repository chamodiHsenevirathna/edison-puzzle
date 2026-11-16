import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { loadPrefs, savePrefs, type Preferences } from "./storage";

interface Ctx {
  prefs: Preferences;
  update: (patch: Partial<Preferences>) => void;
  /** Resolved motion preference: true when animation should be minimised. */
  reducedMotion: boolean;
}
const PrefsContext = createContext<Ctx | null>(null);

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Preferences>(loadPrefs);
  const [systemReduce, setSystemReduce] = useState(
    () =>
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setSystemReduce(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  const reducedMotion = prefs.reduceMotion === "on" || (prefs.reduceMotion === "system" && systemReduce);
  useEffect(() => {
    document.documentElement.dataset.motion = reducedMotion ? "off" : "on";
  }, [reducedMotion]);
  const update = useCallback((patch: Partial<Preferences>) => {
    setPrefs((p) => {
      const next = { ...p, ...patch };
      savePrefs(next);
      return next;
    });
  }, []);
  const value = useMemo(() => ({ prefs, update, reducedMotion }), [prefs, update, reducedMotion]);
  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export function usePrefs(): Ctx {
  const c = useContext(PrefsContext);
  if (!c) throw new Error("usePrefs must be used inside <PrefsProvider>");
  return c;
}
