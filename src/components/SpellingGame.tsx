import { useCallback, useEffect, useRef, useState } from "react";
import wordsData from "../content/words.json";
import { useSettings } from "../settings/SettingsContext";
import type { RoundPhase, WordEntry } from "../types";

const words = wordsData as WordEntry[];

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function playChime(soundEnabled: boolean) {
  if (!soundEnabled) return;
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  const ctx = new AC();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = 523.25;
  gain.gain.value = 0.08;
  osc.connect(gain);
  gain.connect(ctx.destination);
  void ctx.resume().then(() => {
    osc.start();
    osc.stop(ctx.currentTime + 0.18);
  });
}

function speakWord(text: string) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 0.92;
  window.speechSynthesis.speak(u);
}

export function SpellingGame() {
  const { settings, effectiveReduceMotion } = useSettings();
  const [started, setStarted] = useState(false);
  const [order, setOrder] = useState<string[]>(() => shuffle(words.map((w) => w.id)));
  const [orderIndex, setOrderIndex] = useState(0);
  const [typed, setTyped] = useState("");
  const [phase, setPhase] = useState<RoundPhase>("idle");
  const [stickers, setStickers] = useState<string[]>([]);
  const [wrongMask, setWrongMask] = useState<boolean[] | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const announceRef = useRef<HTMLDivElement>(null);
  const chimeGate = useRef(false);

  const current = words.find((w) => w.id === order[orderIndex]) ?? words[0];
  const target = current.word.toLowerCase();
  const len = target.length;

  const transitionMs = settings.slowTransitions ? 520 : 160;

  const goNextWord = useCallback(() => {
    setTyped("");
    setWrongMask(null);
    setPhase("typing");
    setOrderIndex((i) => {
      const next = i + 1;
      if (next >= words.length) {
        setOrder(shuffle(words.map((w) => w.id)));
        return 0;
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (phase !== "celebrate") return;
    const wait = effectiveReduceMotion ? 900 : 1600;
    const t = window.setTimeout(() => {
      if (!settings.repeatWordsMode) {
        setTyped("");
        setWrongMask(null);
        setPhase("typing");
        setOrderIndex((i) => {
          const next = i + 1;
          if (next >= words.length) {
            setOrder(shuffle(words.map((w) => w.id)));
            return 0;
          }
          return next;
        });
      } else {
        setPhase("typing");
        setTyped("");
        setWrongMask(null);
      }
    }, wait);
    return () => window.clearTimeout(t);
  }, [phase, effectiveReduceMotion, settings.repeatWordsMode]);

  useEffect(() => {
    if (phase === "celebrate") {
      if (!chimeGate.current) {
        chimeGate.current = true;
        playChime(settings.soundEnabled);
      }
      return;
    }
    chimeGate.current = false;
  }, [phase, settings.soundEnabled]);

  useEffect(() => {
    if (started && phase === "typing" && panelRef.current) {
      panelRef.current.focus();
    }
  }, [started, phase, orderIndex, current.id]);

  useEffect(() => {
    if (phase === "celebrate") return;
    if (typed.length !== len || len === 0) {
      if (typed.length < len) setWrongMask(null);
      return;
    }
    const t = typed.toLowerCase();
    if (t === target) {
      setWrongMask(null);
      setPhase("celebrate");
      setStickers((s) => (s.includes(current.id) ? s : [...s, current.id]));
      const el = announceRef.current;
      if (el) {
        el.textContent = `Nice spelling. You spelled ${current.word}.`;
      }
    } else {
      const mask = target.split("").map((ch, i) => t[i] !== ch);
      setWrongMask(mask);
      const el = announceRef.current;
      if (el) {
        el.textContent =
          "Not quite yet. You can use Backspace to change letters.";
      }
    }
  }, [typed, len, target, current.id, current.word, phase]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!started || phase === "celebrate") return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    if (e.key === "Backspace") {
      e.preventDefault();
      setTyped((s) => s.slice(0, -1));
      return;
    }

    if (e.key.length === 1 && /[a-zA-Z]/.test(e.key)) {
      e.preventDefault();
      if (typed.length >= len) return;
      setTyped((s) => (s + e.key).toLowerCase());
    }
  };

  const begin = () => {
    setStarted(true);
    setPhase("typing");
    setTyped("");
    setWrongMask(null);
    queueMicrotask(() => panelRef.current?.focus());
  };

  const sameWordAgain = () => {
    setTyped("");
    setWrongMask(null);
    setPhase("typing");
    panelRef.current?.focus();
  };

  const rootClass = [
    settings.largeUi ? "ui-large" : "",
    settings.highContrast ? "ui-high-contrast" : "",
    settings.slowTransitions ? "ui-slow" : "",
    effectiveReduceMotion ? "ui-reduce-motion" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={`game-root ${rootClass}`} style={{ "--mc-transition": `${transitionMs}ms` } as React.CSSProperties}>
      <div className="hero-strip" aria-hidden="true">
        <CastleSilhouette />
        <div className="hero-text">
          <p className="hero-kicker">Magic Castle</p>
          <h1 className="hero-title">Spelling practice</h1>
        </div>
        <ToolPal />
      </div>

      {!started ? (
        <div className="start-panel">
          <p className="lede">
            Use your <strong>keyboard</strong>. Type each letter. Press{" "}
            <kbd>Backspace</kbd> to fix a letter.
          </p>
          <button type="button" className="btn primary" onClick={begin}>
            Start playing
          </button>
        </div>
      ) : (
        <div
          ref={panelRef}
          className="spell-panel"
          role="region"
          tabIndex={0}
          onKeyDown={onKeyDown}
          onPaste={(e) => e.preventDefault()}
          aria-label="Spelling area. Type letters to spell the word."
        >
          <div className="word-meta">
            <p className="hint-label">Picture in your mind</p>
            <p className="hint-text">{current.hint ?? "Spell the word."}</p>
            <p className="target-len">
              This word has <strong>{len}</strong> letters.
            </p>
          </div>

          <div className="slots" role="group" aria-label="Letter boxes">
            {Array.from({ length: len }, (_, i) => {
              const ch = typed[i] ?? "";
              const wrong = wrongMask && wrongMask[i] && typed.length === len;
              const highlight =
                settings.highlightFirstSlot && typed.length === 0 && i === 0;
              return (
                <div
                  key={i}
                  className={[
                    "slot",
                    ch ? "filled" : "",
                    wrong ? "wrong" : "",
                    highlight ? "highlight-first" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  aria-label={
                    ch
                      ? `Letter ${i + 1}: ${ch}`
                      : `Letter ${i + 1}, empty`
                  }
                >
                  {ch ? ch.toUpperCase() : ""}
                </div>
              );
            })}
          </div>

          <div className="tool-row" aria-label="Toodles tools">
            <button
              type="button"
              className="btn"
              onClick={() => speakWord(current.word)}
            >
              Say the word
            </button>
            <button type="button" className="btn" onClick={sameWordAgain}>
              Clear letters
            </button>
            {settings.repeatWordsMode && phase !== "celebrate" ? (
              <button type="button" className="btn primary" onClick={goNextWord}>
                Next word
              </button>
            ) : null}
          </div>

          <div
            ref={announceRef}
            className="sr-live"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          />
        </div>
      )}

      {phase === "celebrate" ? (
        <div
          className="celebration"
          role="dialog"
          aria-modal="true"
          aria-label="Celebration"
        >
          <div className="celebration-card">
            <p className="celebration-title">You did it!</p>
            <p className="celebration-word">{current.word.toUpperCase()}</p>
            <StarBurst reduced={effectiveReduceMotion} />
            {settings.repeatWordsMode ? (
              <button
                type="button"
                className="btn primary"
                onClick={() => {
                  setPhase("typing");
                  setTyped("");
                  setWrongMask(null);
                  setOrderIndex((i) => {
                    const next = i + 1;
                    if (next >= words.length) {
                      setOrder(shuffle(words.map((w) => w.id)));
                      return 0;
                    }
                    return next;
                  });
                  queueMicrotask(() => panelRef.current?.focus());
                }}
              >
                Next word
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="stickers" aria-label="Stickers you earned this session">
        <h2 className="stickers-title">Stickers</h2>
        <ul className="sticker-list">
          {stickers.map((id) => (
            <li key={id} className="sticker">
              {words.find((w) => w.id === id)?.word ?? id}
            </li>
          ))}
          {stickers.length === 0 ? (
            <li className="sticker empty">Spell a word to earn one</li>
          ) : null}
        </ul>
      </div>
    </div>
  );
}

function StarBurst({ reduced }: { reduced: boolean }) {
  if (reduced) {
    return <p className="celebration-quiet">Great job.</p>;
  }
  const stars = [
    { cx: 18, cy: 14, delay: "0s" },
    { cx: 42, cy: 22, delay: "0.08s" },
    { cx: 66, cy: 12, delay: "0.16s" },
    { cx: 90, cy: 22, delay: "0.24s" },
  ];
  return (
    <svg className="star-burst" viewBox="0 0 108 36" aria-hidden="true">
      {stars.map((s) => (
        <polygon
          key={`${s.cx}-${s.cy}`}
          className="star"
          points={`${s.cx},${s.cy - 8} ${s.cx + 5},${s.cy} ${s.cx + 14},${s.cy} ${s.cx + 6},${s.cy + 6} ${s.cx + 10},${s.cy + 16} ${s.cx},${s.cy + 10} ${s.cx - 10},${s.cy + 16} ${s.cx - 6},${s.cy + 6} ${s.cx - 14},${s.cy} ${s.cx - 5},${s.cy}`}
          style={{ animationDelay: s.delay }}
        />
      ))}
    </svg>
  );
}

function CastleSilhouette() {
  return (
    <svg
      className="castle-svg"
      viewBox="0 0 120 100"
      role="img"
      aria-label="Castle"
    >
      <path
        fill="currentColor"
        d="M10 95V45h15v10h10V35h15v20h10V25h20v30h10V40h15v55H10z"
      />
      <rect x="52" y="55" width="16" height="18" fill="var(--mc-sky)" />
    </svg>
  );
}

function ToolPal() {
  return (
    <svg
      className="toolpal-svg"
      viewBox="0 0 100 90"
      role="img"
      aria-label="Friendly tool helper"
    >
      <rect x="18" y="22" width="64" height="52" rx="12" fill="currentColor" />
      <circle cx="38" cy="42" r="6" fill="var(--mc-sky)" />
      <circle cx="62" cy="42" r="6" fill="var(--mc-sky)" />
      <rect x="30" y="58" width="40" height="6" rx="2" fill="var(--mc-sky)" />
      <rect x="44" y="8" width="12" height="18" rx="3" fill="currentColor" />
    </svg>
  );
}
