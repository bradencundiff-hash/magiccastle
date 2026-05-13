import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Settings = {
  soundEnabled: boolean;
  /** When set, overrides system reduced-motion preference. */
  userReduceMotion: boolean | null;
  largeUi: boolean;
  highContrast: boolean;
  highlightFirstSlot: boolean;
  slowTransitions: boolean;
  repeatWordsMode: boolean;
};

const STORAGE_KEY = "magiccastle-settings-v1";

const defaultSettings: Settings = {
  soundEnabled: true,
  userReduceMotion: null,
  largeUi: false,
  highContrast: false,
  highlightFirstSlot: false,
  slowTransitions: false,
  repeatWordsMode: false,
};

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultSettings;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return { ...defaultSettings, ...parsed };
  } catch {
    return defaultSettings;
  }
}

type SettingsContextValue = {
  settings: Settings;
  setSettings: (patch: Partial<Settings>) => void;
  /** True when system or user wants reduced motion. */
  effectiveReduceMotion: boolean;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettingsState] = useState<Settings>(() =>
    typeof window === "undefined" ? defaultSettings : loadSettings(),
  );
  const [systemReduceMotion, setSystemReduceMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setSystemReduceMotion(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      /* ignore */
    }
  }, [settings]);

  const setSettings = useCallback((patch: Partial<Settings>) => {
    setSettingsState((s) => ({ ...s, ...patch }));
  }, []);

  const effectiveReduceMotion =
    settings.userReduceMotion === null
      ? systemReduceMotion
      : settings.userReduceMotion;

  const value = useMemo(
    () => ({ settings, setSettings, effectiveReduceMotion }),
    [settings, setSettings, effectiveReduceMotion],
  );

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
