import { Eraser, Play, Shuffle, Square } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import * as Slider from "@radix-ui/react-slider";
import { createEngine, type Engine } from "@/lib/engine";
import {
  BPM_RANGE,
  PRESETS,
  STEPS,
  SWING_RANGE,
  TRACKS,
  useLattice,
  type TrackId,
} from "@/lib/pattern";

const GROUPS = [0, 1, 2, 3];

function StepGroups({ items }: { items: ReactNode[] }) {
  return (
    <div className="step-groups">
      {GROUPS.map((group) => (
        <div className="step-group" key={group}>
          {items.slice(group * 4, group * 4 + 4)}
        </div>
      ))}
    </div>
  );
}

function Meter({
  id,
  label,
  value,
  min,
  max,
  unit,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="control-head">
        <span id={id}>{label}</span>
        <span className="control-value">
          {value}
          {unit}
        </span>
      </div>
      <Slider.Root
        className="range"
        min={min}
        max={max}
        step={1}
        value={[value]}
        aria-labelledby={id}
        onValueChange={(next) => onChange(next[0] ?? min)}
      >
        <Slider.Track className="range-track">
          <Slider.Range className="range-fill" />
        </Slider.Track>
        <Slider.Thumb className="range-thumb" />
      </Slider.Root>
    </div>
  );
}

export function Lattice() {
  const grid = useLattice((s) => s.grid);
  const bpm = useLattice((s) => s.bpm);
  const swing = useLattice((s) => s.swing);
  const volume = useLattice((s) => s.volume);
  const mutes = useLattice((s) => s.mutes);
  const presetId = useLattice((s) => s.presetId);
  const playing = useLattice((s) => s.playing);
  const step = useLattice((s) => s.step);
  const setCell = useLattice((s) => s.setCell);
  const toggleMute = useLattice((s) => s.toggleMute);
  const setBpm = useLattice((s) => s.setBpm);
  const setSwing = useLattice((s) => s.setSwing);
  const setVolume = useLattice((s) => s.setVolume);
  const clear = useLattice((s) => s.clear);
  const randomize = useLattice((s) => s.randomize);
  const loadPreset = useLattice((s) => s.loadPreset);
  const setPlaying = useLattice((s) => s.setPlaying);

  const engineRef = useRef<Engine | null>(null);
  const snapRef = useRef({ grid, bpm, swing, volume, mutes });
  snapRef.current = { grid, bpm, swing, volume, mutes };
  const paintRef = useRef<{ track: TrackId; value: boolean } | null>(null);
  const ignoreClick = useRef(false);
  const [audioNote, setAudioNote] = useState<string | null>(null);

  function engine() {
    if (!engineRef.current) {
      engineRef.current = createEngine(
        () => snapRef.current,
        (next) => useLattice.getState().setStep(next),
      );
    }
    return engineRef.current;
  }

  function onPlay() {
    try {
      const next = engine().toggle();
      setPlaying(next);
      setAudioNote(null);
    } catch {
      setAudioNote("This browser blocked the audio engine.");
    }
  }

  const playRef = useRef(onPlay);
  playRef.current = onPlay;

  useEffect(() => {
    useLattice.getState().hydrate();
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.repeat) return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      playRef.current();
    };
    const onUp = () => {
      paintRef.current = null;
      window.setTimeout(() => {
        ignoreClick.current = false;
      }, 0);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerup", onUp);
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, []);

  function writePad(track: TrackId, index: number, value: boolean, preview: boolean) {
    setCell(track, index, value);
    if (!preview || !value) return;
    try {
      engine().preview(track);
      setAudioNote(null);
    } catch {
      setAudioNote("This browser blocked the audio engine.");
    }
  }

  const beat = step >= 0 ? Math.floor(step / 4) : -1;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-4 py-6 sm:px-6 sm:py-10">
      <div className="chassis flex flex-col gap-5 p-4 sm:p-6">
        <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-4 lg:justify-start">
              <h1 className="font-mono text-2xl font-semibold tracking-widest uppercase">Lattice</h1>
              <span className="font-mono text-xs tracking-widest text-muted">LK-16</span>
            </div>
            <p className="text-sm text-muted">16-step drum machine</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex items-end gap-4">
              <p className="flex items-end gap-2">
                <span className="bpm-num">{bpm}</span>
                <span className="pb-1 font-mono text-xs tracking-widest text-muted">BPM</span>
              </p>
              <p className="step-num pb-1 text-accent" aria-hidden="true">
                {step >= 0 ? String(step + 1).padStart(2, "0") : "--"}
              </p>
              <div className="mb-1.5 lamps" aria-hidden="true">
                {GROUPS.map((lamp) => (
                  <span key={lamp} className="lamp" data-on={beat === lamp ? "true" : "false"} />
                ))}
              </div>
            </div>
            <button type="button" className="btn btn-play w-full sm:w-auto" onClick={onPlay}>
              <span className="icon-swap" aria-hidden="true">
                <Play className={playing ? "is-hidden" : "is-shown"} fill="currentColor" strokeWidth={2} />
                <Square
                  className={playing ? "icon-abs is-shown" : "icon-abs is-hidden"}
                  fill="currentColor"
                  strokeWidth={2}
                />
              </span>
              {playing ? "Stop" : "Play"}
            </button>
          </div>
        </header>

        <div className="rule" />

        <div className="grid-wrap">
          <div className="track-col">
            <div className="ruler-spacer" />
            {TRACKS.map((track) => {
              const muted = mutes[track.id];
              return (
                <button
                  key={track.id}
                  type="button"
                  className="track-label"
                  data-muted={muted ? "true" : "false"}
                  aria-pressed={muted}
                  aria-label={muted ? `Unmute ${track.name}` : `Mute ${track.name}`}
                  onClick={() => toggleMute(track.id)}
                >
                  <span className="led" data-on={muted ? "false" : "true"} />
                  <span className="track-copy">
                    <span className="track-name">{track.label}</span>
                    <span className="track-state" data-live={muted ? "false" : "true"}>
                      {muted ? "Off" : "On"}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          <div className="step-scroll">
            <div className="step-board">
              <StepGroups
                items={Array.from({ length: STEPS }, (_, index) => (
                  <div
                    key={index}
                    className="ruler-cell"
                    data-beat={index % 4 === 0 ? "true" : "false"}
                    data-now={step === index ? "true" : "false"}
                  >
                    {index + 1}
                  </div>
                ))}
              />
              {TRACKS.map((track) => (
                <div key={track.id} className="pad-row" data-muted={mutes[track.id] ? "true" : "false"}>
                  <StepGroups
                    items={grid[track.id].map((on, index) => (
                      <button
                        key={index}
                        type="button"
                        className="pad"
                        data-on={on ? "true" : "false"}
                        data-now={step === index ? "true" : "false"}
                        aria-pressed={on}
                        aria-label={`${track.name} step ${index + 1}`}
                        onClick={() => {
                          if (ignoreClick.current) {
                            ignoreClick.current = false;
                            return;
                          }
                          writePad(track.id, index, !on, true);
                        }}
                        onPointerDown={(event) => {
                          if (event.pointerType === "touch") return;
                          event.preventDefault();
                          ignoreClick.current = true;
                          const value = !on;
                          paintRef.current = { track: track.id, value };
                          writePad(track.id, index, value, true);
                        }}
                        onPointerEnter={(event) => {
                          const paint = paintRef.current;
                          if (!paint || paint.track !== track.id) return;
                          if (event.pointerType === "touch" || event.buttons !== 1) return;
                          writePad(track.id, index, paint.value, false);
                        }}
                      />
                    ))}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rule" />

        <div className="grid gap-4 sm:grid-cols-3">
          <Meter
            id="tempo-label"
            label="Tempo"
            value={bpm}
            min={BPM_RANGE.min}
            max={BPM_RANGE.max}
            unit=" BPM"
            onChange={setBpm}
          />
          <Meter
            id="swing-label"
            label="Swing"
            value={swing}
            min={SWING_RANGE.min}
            max={SWING_RANGE.max}
            unit="%"
            onChange={setSwing}
          />
          <Meter id="level-label" label="Level" value={volume} min={0} max={100} unit="%" onChange={setVolume} />
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className="btn flex-1"
                data-active={presetId === preset.id ? "true" : "false"}
                aria-pressed={presetId === preset.id}
                onClick={() => loadPreset(preset.id)}
              >
                {preset.name}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn flex-1 sm:flex-none" onClick={clear}>
              <Eraser className="size-4" aria-hidden="true" />
              Clear
            </button>
            <button type="button" className="btn flex-1 sm:flex-none" onClick={randomize}>
              <Shuffle className="size-4" aria-hidden="true" />
              Randomize
            </button>
          </div>
        </div>

        <p className="text-sm text-muted">
          Tap a pad to program it and hear the hit. Drag across a row to paint. Swipe sideways if the bar runs off
          the screen. Space plays and stops. Tap a name to mute that voice.
        </p>
        {audioNote ? <p className="text-sm text-accent">{audioNote}</p> : null}
      </div>
    </main>
  );
}
