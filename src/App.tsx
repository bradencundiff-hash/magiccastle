import { SpellingGame } from "./components/SpellingGame";
import { SettingsProvider, useSettings } from "./settings/SettingsContext";
import "./index.css";

function SettingsBar() {
  const { settings, setSettings, effectiveReduceMotion } = useSettings();

  const motionMode =
    settings.userReduceMotion === null
      ? "system"
      : settings.userReduceMotion
        ? "reduce"
        : "allow";

  return (
    <aside className="settings-bar" aria-label="Mousekedoer settings">
      <h2 className="settings-heading">🛠️ Mousekedoer</h2>
      <div className="settings-grid">
        <label className="field">
          <span className="field-label">Motion</span>
          <select
            className="select"
            value={motionMode}
            onChange={(e) => {
              const v = e.target.value;
              setSettings({
                userReduceMotion:
                  v === "system" ? null : v === "reduce" ? true : false,
              });
            }}
          >
            <option value="system">Match the computer setting</option>
            <option value="reduce">Always reduce motion</option>
            <option value="allow">Allow celebration motion</option>
          </select>
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={settings.soundEnabled}
            onChange={(e) => setSettings({ soundEnabled: e.target.checked })}
          />
          <span>Soft success sound</span>
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={settings.largeUi}
            onChange={(e) => setSettings({ largeUi: e.target.checked })}
          />
          <span>Bigger letters and buttons</span>
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={settings.highContrast}
            onChange={(e) => setSettings({ highContrast: e.target.checked })}
          />
          <span>Higher contrast</span>
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={settings.highlightFirstSlot}
            onChange={(e) =>
              setSettings({ highlightFirstSlot: e.target.checked })
            }
          />
          <span>Toodles: glow the first letter spot</span>
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={settings.slowTransitions}
            onChange={(e) => setSettings({ slowTransitions: e.target.checked })}
          />
          <span>Slower screen changes</span>
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={settings.repeatWordsMode}
            onChange={(e) =>
              setSettings({ repeatWordsMode: e.target.checked })
            }
          />
          <span>Stay on a word until I press Next word</span>
        </label>
      </div>
      <p className="settings-note" role="note">
        Reduced motion right now:{" "}
        <strong>{effectiveReduceMotion ? "on" : "off"}</strong>.
      </p>
    </aside>
  );
}

function AppShell() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <h1 className="app-title">Mickey's Playhouse Speller</h1>
        <p className="app-tagline">
          Drag letters, type, or tap — spell fun words with Toodles!
        </p>
      </header>
      <main className="app-main">
        <SettingsBar />
        <SpellingGame />
      </main>
      <footer className="app-footer">
        <p>
          Media policy: see{" "}
          <a href="https://github.com/bradencundiff-hash/magiccastle/blob/main/ATTRIBUTION.md">
            ATTRIBUTION.md
          </a>{" "}
          — all character art in this project is original SVG.
        </p>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <SettingsProvider>
      <AppShell />
    </SettingsProvider>
  );
}
