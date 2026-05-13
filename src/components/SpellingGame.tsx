import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import wordsData from "../content/words.json";
import { useSettings } from "../settings/SettingsContext";
import type { RoundPhase, WordEntry } from "../types";

const words = wordsData as WordEntry[];

const DND_MIME = "application/x-magiccastle-tile+json";

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

type LetterTile = { id: string; char: string };

type LayoutState = {
  bankIds: string[];
  slotTileIds: (string | null)[];
};

type LayoutAction =
  | { type: "reset"; tileIds: string[]; slotCount: number }
  | { type: "placeKeyboard"; char: string; charMap: Record<string, string> }
  | { type: "backspace" }
  | { type: "dropBankToSlot"; tileId: string; slotIndex: number }
  | { type: "dropSlotToSlot"; fromIndex: number; toIndex: number }
  | { type: "dropSlotToBank"; fromIndex: number };

function layoutReducer(state: LayoutState, action: LayoutAction): LayoutState {
  switch (action.type) {
    case "reset":
      return {
        bankIds: shuffle([...action.tileIds]),
        slotTileIds: Array.from({ length: action.slotCount }, () => null),
      };
    case "placeKeyboard": {
      const empty = state.slotTileIds.findIndex((x) => x === null);
      if (empty === -1) return state;
      const bankIdx = state.bankIds.findIndex(
        (id) => action.charMap[id] === action.char,
      );
      if (bankIdx === -1) return state;
      const tileId = state.bankIds[bankIdx];
      const bankIds = state.bankIds.filter((_, i) => i !== bankIdx);
      const slotTileIds = [...state.slotTileIds];
      slotTileIds[empty] = tileId;
      return { bankIds, slotTileIds };
    }
    case "backspace": {
      let last = -1;
      for (let i = state.slotTileIds.length - 1; i >= 0; i--) {
        if (state.slotTileIds[i] !== null) {
          last = i;
          break;
        }
      }
      if (last === -1) return state;
      const tileId = state.slotTileIds[last]!;
      const slotTileIds = [...state.slotTileIds];
      slotTileIds[last] = null;
      return { bankIds: [...state.bankIds, tileId], slotTileIds };
    }
    case "dropBankToSlot": {
      const { tileId, slotIndex } = action;
      if (!state.bankIds.includes(tileId)) return state;
      const bankIds = state.bankIds.filter((id) => id !== tileId);
      const slotTileIds = [...state.slotTileIds];
      const displaced = slotTileIds[slotIndex];
      if (displaced) bankIds.push(displaced);
      slotTileIds[slotIndex] = tileId;
      return { bankIds, slotTileIds };
    }
    case "dropSlotToSlot": {
      const { fromIndex, toIndex } = action;
      if (fromIndex === toIndex) return state;
      const moving = state.slotTileIds[fromIndex];
      if (!moving) return state;
      const slotTileIds = [...state.slotTileIds];
      const atTarget = slotTileIds[toIndex];
      slotTileIds[fromIndex] = atTarget;
      slotTileIds[toIndex] = moving;
      return { bankIds: state.bankIds, slotTileIds };
    }
    case "dropSlotToBank": {
      const { fromIndex } = action;
      const tileId = state.slotTileIds[fromIndex];
      if (!tileId) return state;
      const slotTileIds = [...state.slotTileIds];
      slotTileIds[fromIndex] = null;
      return { bankIds: [...state.bankIds, tileId], slotTileIds };
    }
    default:
      return state;
  }
}

function playChime(soundEnabled: boolean) {
  if (!soundEnabled) return;
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
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

type DragPayload =
  | { source: "bank"; tileId: string }
  | { source: "slot"; tileId: string; fromSlot: number };

function readDragPayload(e: React.DragEvent): DragPayload | null {
  const raw = e.dataTransfer.getData(DND_MIME) || e.dataTransfer.getData("text/plain");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DragPayload;
  } catch {
    return null;
  }
}

export function SpellingGame() {
  const { settings, effectiveReduceMotion } = useSettings();
  const [started, setStarted] = useState(false);
  const [order, setOrder] = useState<string[]>(() => shuffle(words.map((w) => w.id)));
  const [orderIndex, setOrderIndex] = useState(0);
  const [layout, dispatchLayout] = useReducer(layoutReducer, {
    bankIds: [],
    slotTileIds: [],
  });
  const [phase, setPhase] = useState<RoundPhase>("idle");
  const [stickers, setStickers] = useState<string[]>([]);
  const [wrongMask, setWrongMask] = useState<boolean[] | null>(null);
  const [dropSlot, setDropSlot] = useState<number | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const announceRef = useRef<HTMLDivElement>(null);
  const chimeGate = useRef(false);

  const current = words.find((w) => w.id === order[orderIndex]) ?? words[0];
  const target = current.word.toLowerCase();
  const len = target.length;

  const letterTiles: LetterTile[] = useMemo(
    () =>
      target.split("").map((char, i) => ({
        id: `${current.id}-${i}`,
        char: char.toLowerCase(),
      })),
    [current.id, target],
  );

  const charMap = useMemo(
    () => Object.fromEntries(letterTiles.map((t) => [t.id, t.char])),
    [letterTiles],
  );

  const typedString = useMemo(
    () =>
      layout.slotTileIds
        .map((id) => (id ? charMap[id] ?? "" : ""))
        .join(""),
    [layout.slotTileIds, charMap],
  );

  const allSlotsFilled =
    len > 0 && layout.slotTileIds.length === len && layout.slotTileIds.every(Boolean);

  const transitionMs = settings.slowTransitions ? 520 : 160;

  const resetLayout = useCallback(() => {
    dispatchLayout({
      type: "reset",
      tileIds: letterTiles.map((t) => t.id),
      slotCount: letterTiles.length,
    });
  }, [letterTiles]);

  useEffect(() => {
    if (!started) return;
    resetLayout();
  }, [started, current.id, resetLayout]);

  const goNextWord = useCallback(() => {
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
        setWrongMask(null);
        resetLayout();
      }
    }, wait);
    return () => window.clearTimeout(t);
  }, [phase, effectiveReduceMotion, settings.repeatWordsMode, resetLayout]);

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
    if (!allSlotsFilled) {
      setWrongMask(null);
      return;
    }
    const t = typedString.toLowerCase();
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
          "Not quite yet. You can drag letters to fix them, or use Backspace.";
      }
    }
  }, [typedString, allSlotsFilled, target, current.id, current.word, phase]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!started || phase === "celebrate") return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    if (e.key === "Backspace") {
      e.preventDefault();
      dispatchLayout({ type: "backspace" });
      return;
    }

    if (e.key.length === 1 && /[a-zA-Z]/.test(e.key)) {
      e.preventDefault();
      const firstEmpty = layout.slotTileIds.findIndex((x) => x === null);
      if (firstEmpty === -1) return;
      dispatchLayout({
        type: "placeKeyboard",
        char: e.key.toLowerCase(),
        charMap,
      });
    }
  };

  const begin = () => {
    dispatchLayout({
      type: "reset",
      tileIds: letterTiles.map((t) => t.id),
      slotCount: letterTiles.length,
    });
    setStarted(true);
    setPhase("typing");
    setWrongMask(null);
    queueMicrotask(() => panelRef.current?.focus());
  };

  const sameWordAgain = () => {
    resetLayout();
    setWrongMask(null);
    setPhase("typing");
    panelRef.current?.focus();
  };

  const onDragStartBank = (e: React.DragEvent, tileId: string) => {
    const payload: DragPayload = { source: "bank", tileId };
    e.dataTransfer.setData(DND_MIME, JSON.stringify(payload));
    e.dataTransfer.setData("text/plain", JSON.stringify(payload));
    e.dataTransfer.effectAllowed = "move";
  };

  const onDragStartSlot = (e: React.DragEvent, tileId: string, fromSlot: number) => {
    const payload: DragPayload = { source: "slot", tileId, fromSlot };
    e.dataTransfer.setData(DND_MIME, JSON.stringify(payload));
    e.dataTransfer.setData("text/plain", JSON.stringify(payload));
    e.dataTransfer.effectAllowed = "move";
  };

  const onDropSlot = (e: React.DragEvent, slotIndex: number) => {
    e.preventDefault();
    setDropSlot(null);
    const payload = readDragPayload(e);
    if (!payload) return;
    if (payload.source === "bank") {
      dispatchLayout({
        type: "dropBankToSlot",
        tileId: payload.tileId,
        slotIndex,
      });
      return;
    }
    if (payload.source === "slot") {
      dispatchLayout({
        type: "dropSlotToSlot",
        fromIndex: payload.fromSlot,
        toIndex: slotIndex,
      });
    }
  };

  const onDropBank = (e: React.DragEvent) => {
    e.preventDefault();
    setDropSlot(null);
    const payload = readDragPayload(e);
    if (!payload || payload.source !== "slot") return;
    dispatchLayout({ type: "dropSlotToBank", fromIndex: payload.fromSlot });
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
    <div
      className={`game-root ${rootClass}`}
      style={
        { "--mc-transition": `${transitionMs}ms` } as React.CSSProperties
      }
    >
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
            Use the <strong>letter pool</strong> (drag letters into boxes) or{" "}
            <strong>type</strong> on the keyboard. Letters always match the pool.
            Press <kbd>Backspace</kbd> to remove the last letter from the boxes.
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
          aria-label="Spelling area. Drag letter tiles or type to spell the word."
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
              const id = layout.slotTileIds[i] ?? null;
              const ch = id ? charMap[id] ?? "" : "";
              const wrong = wrongMask && wrongMask[i] && allSlotsFilled;
              const highlight =
                settings.highlightFirstSlot &&
                layout.slotTileIds[0] === null &&
                i === 0;
              const dropHighlight = dropSlot === i;
              return (
                <div
                  key={i}
                  className={[
                    "slot",
                    ch ? "filled" : "",
                    wrong ? "wrong" : "",
                    highlight ? "highlight-first" : "",
                    dropHighlight ? "drop-target" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  aria-label={
                    ch
                      ? `Letter ${i + 1}: ${ch}`
                      : `Letter ${i + 1}, empty drop box`
                  }
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    setDropSlot(i);
                  }}
                  onDragLeave={() => setDropSlot((s) => (s === i ? null : s))}
                  onDrop={(e) => onDropSlot(e, i)}
                >
                  {ch ? (
                    <span
                      className="slot-tile"
                      draggable
                      onDragStart={(e) =>
                        id ? onDragStartSlot(e, id, i) : undefined
                      }
                    >
                      {ch.toUpperCase()}
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>

          <div className="letter-pool-wrap">
            <p className="letter-pool-label" id="letter-pool-heading">
              Letter pool (reference)
            </p>
            <div
              className="letter-pool"
              role="group"
              aria-labelledby="letter-pool-heading"
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
              }}
              onDrop={onDropBank}
            >
              {layout.bankIds.length === 0 ? (
                <p className="letter-pool-empty">All letters are in the boxes.</p>
              ) : (
                layout.bankIds.map((tileId) => (
                  <button
                    key={tileId}
                    type="button"
                    className="letter-tile"
                    draggable
                    onDragStart={(e) => onDragStartBank(e, tileId)}
                    aria-label={`Letter ${charMap[tileId]?.toUpperCase() ?? ""} in the pool`}
                  >
                    {(charMap[tileId] ?? "").toUpperCase()}
                  </button>
                ))
              )}
            </div>
            <p className="letter-pool-hint">
              Drag a tile into a box, or type — both use the same letters.
            </p>
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
