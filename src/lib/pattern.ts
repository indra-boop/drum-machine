import { create } from "zustand";

export const STEPS = 16;

export const TRACKS = [
  { id: "kick", label: "Kick", name: "Kick" },
  { id: "snare", label: "Snare", name: "Snare" },
  { id: "hat", label: "Hats", name: "Hats" },
  { id: "perc", label: "Perc", name: "Percussion" },
] as const;

export type TrackId = (typeof TRACKS)[number]["id"];
export type Grid = Record<TrackId, boolean[]>;

export type Snapshot = {
  grid: Grid;
  bpm: number;
  swing: number;
  volume: number;
  mutes: Record<TrackId, boolean>;
};

export type Preset = {
  id: string;
  name: string;
  bpm: number;
  swing: number;
  grid: Grid;
};

const BPM_MIN = 60;
const BPM_MAX = 180;
const SWING_MAX = 50;
const STORAGE_KEY = "lattice.pattern.v1";

function row(pattern: string): boolean[] {
  if (pattern.length !== STEPS || /[^x.]/.test(pattern)) {
    throw new Error(`Bad pattern: ${pattern}`);
  }
  return [...pattern].map((cell) => cell === "x");
}

export const PRESETS: Preset[] = [
  {
    id: "floor",
    name: "Floor",
    bpm: 124,
    swing: 0,
    grid: {
      kick: row("x...x...x...x..."),
      snare: row("....x.......x..."),
      hat: row("x.x.x.x.x.x.x.x."),
      perc: row("..x.......x...x."),
    },
  },
  {
    id: "pocket",
    name: "Pocket",
    bpm: 92,
    swing: 22,
    grid: {
      kick: row("x..x..x...x....."),
      snare: row("....x.......x..x"),
      hat: row("x.xx.xx.x.x.x.x."),
      perc: row("......x......x.."),
    },
  },
  {
    id: "break",
    name: "Break",
    bpm: 138,
    swing: 8,
    grid: {
      kick: row("x...x..x..x.x..."),
      snare: row("....x..x....x..."),
      hat: row("x.x.xxxx.x.x.xx."),
      perc: row("..x...x.....x..x"),
    },
  },
  {
    id: "clave",
    name: "Clave",
    bpm: 112,
    swing: 0,
    grid: {
      kick: row("x...x...x...x..."),
      snare: row("....x.......x..."),
      hat: row("..x...x...x...x."),
      perc: row("x..x..x...x..x.."),
    },
  },
];

export function clamp(n: number, min: number, max: number) {
  if (Number.isNaN(n)) return min;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export function cloneGrid(grid: Grid): Grid {
  return {
    kick: grid.kick.slice(),
    snare: grid.snare.slice(),
    hat: grid.hat.slice(),
    perc: grid.perc.slice(),
  };
}

export function emptyGrid(): Grid {
  const blank = () => Array.from({ length: STEPS }, () => false);
  return { kick: blank(), snare: blank(), hat: blank(), perc: blank() };
}

function chance(p: number) {
  return Math.random() < p;
}

export function randomGrid(): Grid {
  const kick = Array.from({ length: STEPS }, (_, i) => {
    if (i % 4 === 0) return chance(0.88);
    if (i % 2 === 0) return chance(0.28);
    return chance(0.1);
  });
  if (!kick.some(Boolean)) kick[0] = true;

  const snare = Array.from({ length: STEPS }, (_, i) => {
    if (i === 4 || i === 12) return chance(0.9);
    if (i === 10 || i === 14) return chance(0.32);
    return chance(0.05);
  });
  if (!snare[4] && !snare[12]) snare[4] = true;

  const hat = Array.from({ length: STEPS }, (_, i) => (i % 2 === 0 ? chance(0.78) : chance(0.42)));
  const perc = Array.from({ length: STEPS }, (_, i) => chance(i % 4 === 3 ? 0.4 : 0.12));
  return { kick, snare, hat, perc };
}

type Persisted = Snapshot & { presetId: string | null };

type LatticeState = Persisted & {
  playing: boolean;
  step: number;
  hydrate: () => void;
  setCell: (track: TrackId, index: number, value: boolean) => void;
  toggleMute: (track: TrackId) => void;
  setBpm: (bpm: number) => void;
  setSwing: (swing: number) => void;
  setVolume: (volume: number) => void;
  clear: () => void;
  randomize: () => void;
  loadPreset: (id: string) => void;
  setPlaying: (playing: boolean) => void;
  setStep: (step: number) => void;
};

function isBoolRow(value: unknown): value is boolean[] {
  return Array.isArray(value) && value.length === STEPS && value.every((cell) => typeof cell === "boolean");
}

function sanitize(value: unknown): Persisted | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const gridRaw = raw.grid as Record<string, unknown> | undefined;
  if (!gridRaw) return null;
  const grid = {} as Grid;
  for (const track of TRACKS) {
    const cells = gridRaw[track.id];
    if (!isBoolRow(cells)) return null;
    grid[track.id] = cells;
  }
  const mutesRaw = raw.mutes as Record<string, unknown> | undefined;
  const mutes = {} as Record<TrackId, boolean>;
  for (const track of TRACKS) {
    mutes[track.id] = Boolean(mutesRaw?.[track.id]);
  }
  const presetId = typeof raw.presetId === "string" ? raw.presetId : null;
  return {
    grid,
    bpm: clamp(Number(raw.bpm), BPM_MIN, BPM_MAX),
    swing: clamp(Number(raw.swing), 0, SWING_MAX),
    volume: clamp(Number(raw.volume), 0, 100),
    mutes,
    presetId,
  };
}

function pick(state: LatticeState): Persisted {
  return {
    grid: state.grid,
    bpm: state.bpm,
    swing: state.swing,
    volume: state.volume,
    mutes: state.mutes,
    presetId: state.presetId,
  };
}

function writeStorage(state: LatticeState) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pick(state)));
  } catch {
    // Ignore private-mode quota failures.
  }
}

function readStorage(): Persisted | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return sanitize(JSON.parse(raw));
  } catch {
    return null;
  }
}

const floor = PRESETS[0];

export const useLattice = create<LatticeState>((set, get) => ({
  grid: cloneGrid(floor.grid),
  bpm: floor.bpm,
  swing: floor.swing,
  volume: 80,
  mutes: { kick: false, snare: false, hat: false, perc: false },
  presetId: floor.id,
  playing: false,
  step: -1,
  hydrate: () => {
    const saved = readStorage();
    if (saved) set(saved);
  },
  setCell: (track, index, value) => {
    const current = get().grid[track];
    if (current[index] === value) return;
    const nextRow = current.slice();
    nextRow[index] = value;
    set({ grid: { ...get().grid, [track]: nextRow }, presetId: null });
    writeStorage(get());
  },
  toggleMute: (track) => {
    set({ mutes: { ...get().mutes, [track]: !get().mutes[track] } });
    writeStorage(get());
  },
  setBpm: (bpm) => {
    set({ bpm: clamp(bpm, BPM_MIN, BPM_MAX) });
    writeStorage(get());
  },
  setSwing: (swing) => {
    set({ swing: clamp(swing, 0, SWING_MAX) });
    writeStorage(get());
  },
  setVolume: (volume) => {
    set({ volume: clamp(volume, 0, 100) });
    writeStorage(get());
  },
  clear: () => {
    set({ grid: emptyGrid(), presetId: null });
    writeStorage(get());
  },
  randomize: () => {
    set({ grid: randomGrid(), presetId: null });
    writeStorage(get());
  },
  loadPreset: (id) => {
    const preset = PRESETS.find((item) => item.id === id);
    if (!preset) return;
    set({
      grid: cloneGrid(preset.grid),
      bpm: preset.bpm,
      swing: preset.swing,
      presetId: preset.id,
    });
    writeStorage(get());
  },
  setPlaying: (playing) => set({ playing }),
  setStep: (step) => set((state) => (state.step === step ? state : { step })),
}));

export const BPM_RANGE = { min: BPM_MIN, max: BPM_MAX };
export const SWING_RANGE = { min: 0, max: SWING_MAX };
