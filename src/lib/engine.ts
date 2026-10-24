import { createNoise, triggerVoice } from "@/lib/drums";
import { STEPS, TRACKS, type Snapshot, type TrackId } from "@/lib/pattern";

type StepEvent = { step: number; time: number };

export type Engine = {
  unlock: () => void;
  resume: () => void;
  toggle: () => boolean;
  preview: (track: TrackId) => void;
  dispose: () => void;
};

function audioContext(): AudioContext {
  const legacy = window as Window & { webkitAudioContext?: typeof AudioContext };
  const Ctor = window.AudioContext ?? legacy.webkitAudioContext;
  if (!Ctor) throw new Error("Web Audio is not available in this browser");
  return new Ctor({ latencyHint: "interactive" });
}

export function createEngine(get: () => Snapshot, onStep: (step: number) => void): Engine {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let bus: GainNode | null = null;
  let noise: AudioBuffer | null = null;
  let playing = false;
  let timer = 0;
  let raf = 0;
  let nextTime = 0;
  let step = 0;
  let lastVol = -1;
  let lastSeen = -1;
  const queue: StepEvent[] = [];
  let onVis: (() => void) | null = null;

  function ensure() {
    if (ctx) {
      if (ctx.state === "suspended") void ctx.resume();
      return;
    }
    ctx = audioContext();
    noise = createNoise(ctx);
    bus = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 16;
    comp.ratio.value = 3.2;
    comp.attack.value = 0.004;
    comp.release.value = 0.18;
    master = ctx.createGain();
    master.gain.value = 0.0001;
    bus.connect(comp);
    comp.connect(master);
    master.connect(ctx.destination);
    onVis = () => {
      if (document.visibilityState === "visible" && ctx && ctx.state === "suspended") {
        void ctx.resume();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    if (ctx.state === "suspended") void ctx.resume();
  }

  function applyVolume(now: number, volume: number, immediate: boolean) {
    if (!ctx || !master) return;
    const target = (Math.min(100, Math.max(0, volume)) / 100) ** 2;
    if (!immediate && Math.abs(target - lastVol) < 0.001) return;
    if (immediate) master.gain.setValueAtTime(target, now);
    else master.gain.setTargetAtTime(target, now, 0.03);
    lastVol = target;
  }

  function hit(track: TrackId, time: number, velocity: number) {
    if (!ctx || !bus || !noise) return;
    triggerVoice(ctx, bus, noise, track, time, velocity);
  }

  function scheduleAhead() {
    if (!ctx || !playing) return;
    const now = ctx.currentTime;
    if (nextTime < now - 0.05) nextTime = now + 0.04;
    const horizon = now + 0.1;
    while (nextTime < horizon) {
      const snap = get();
      const stepLen = 60 / Math.min(180, Math.max(60, snap.bpm)) / 4;
      let when = nextTime;
      if (step % 2 === 1) when += stepLen * (Math.min(50, Math.max(0, snap.swing)) / 100);
      for (const track of TRACKS) {
        if (snap.mutes[track.id]) continue;
        if (!snap.grid[track.id][step]) continue;
        hit(track.id, when, 1);
      }
      queue.push({ step, time: when });
      nextTime += stepLen;
      step = (step + 1) % STEPS;
      applyVolume(now, snap.volume, false);
    }
  }

  function paint() {
    if (!ctx || !playing) return;
    const now = ctx.currentTime;
    let visible = lastSeen;
    for (let i = queue.length - 1; i >= 0; i--) {
      if (queue[i].time <= now + 0.02) {
        visible = queue[i].step;
        break;
      }
    }
    while (queue.length && queue[0].time < now - 0.25) queue.shift();
    if (visible !== lastSeen && visible >= 0) {
      lastSeen = visible;
      onStep(visible);
    }
    raf = requestAnimationFrame(paint);
  }

  function stop() {
    playing = false;
    if (timer) window.clearTimeout(timer);
    if (raf) cancelAnimationFrame(raf);
    timer = 0;
    raf = 0;
    queue.length = 0;
    lastSeen = -1;
    onStep(-1);
  }

  function start() {
    ensure();
    if (!ctx || playing) return;
    const snap = get();
    playing = true;
    step = 0;
    lastSeen = -1;
    queue.length = 0;
    nextTime = ctx.currentTime + 0.05;
    applyVolume(ctx.currentTime, snap.volume, true);
    const loop = () => {
      if (!playing) return;
      scheduleAhead();
      timer = window.setTimeout(loop, 25);
    };
    loop();
    paint();
  }

  return {
    unlock: ensure,
    resume: () => {
      if (ctx && ctx.state === "suspended") void ctx.resume();
    },
    toggle: () => {
      if (playing) {
        stop();
        return false;
      }
      start();
      return true;
    },
    preview: (track) => {
      ensure();
      if (!ctx) return;
      const snap = get();
      applyVolume(ctx.currentTime, snap.volume, lastVol < 0);
      hit(track, ctx.currentTime + 0.012, 0.9);
    },
    dispose: () => {
      playing = false;
      if (timer) window.clearTimeout(timer);
      if (raf) cancelAnimationFrame(raf);
      timer = 0;
      raf = 0;
      if (onVis) document.removeEventListener("visibilitychange", onVis);
      void ctx?.close();
      ctx = null;
    },
  };
}
