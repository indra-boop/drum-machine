import type { TrackId } from "@/lib/pattern";

function disconnectLater(nodes: AudioNode[]) {
  return () => {
    for (const node of nodes) node.disconnect();
  };
}

function noiseBuffer(ctx: AudioContext, seconds: number) {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

export function createNoise(ctx: AudioContext) {
  return noiseBuffer(ctx, 0.5);
}

function tone(
  ctx: AudioContext,
  dest: AudioNode,
  time: number,
  type: OscillatorType,
  freq: number,
  peak: number,
  release: number,
  pitchTo?: number,
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, time);
  if (pitchTo) osc.frequency.exponentialRampToValueAtTime(pitchTo, time + Math.min(release, 0.1));
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(peak, time + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + release);
  osc.connect(gain);
  gain.connect(dest);
  osc.start(time);
  osc.stop(time + release + 0.02);
  osc.onended = disconnectLater([osc, gain]);
}

function burst(
  ctx: AudioContext,
  dest: AudioNode,
  noise: AudioBuffer,
  time: number,
  peak: number,
  release: number,
  filter: { type: BiquadFilterType; freq: number; q?: number },
) {
  const src = ctx.createBufferSource();
  const gain = ctx.createGain();
  const shape = ctx.createBiquadFilter();
  src.buffer = noise;
  shape.type = filter.type;
  shape.frequency.setValueAtTime(filter.freq, time);
  if (filter.q) shape.Q.value = filter.q;
  gain.gain.setValueAtTime(peak, time);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + release);
  src.connect(shape);
  shape.connect(gain);
  gain.connect(dest);
  src.start(time);
  src.stop(time + release + 0.02);
  src.onended = disconnectLater([src, shape, gain]);
}

function kick(ctx: AudioContext, dest: AudioNode, noise: AudioBuffer, time: number, velocity: number) {
  tone(ctx, dest, time, "sine", 172, velocity * 0.95, 0.32, 46);
  tone(ctx, dest, time, "triangle", 420, velocity * 0.18, 0.03, 90);
  burst(ctx, dest, noise, time, velocity * 0.16, 0.018, { type: "highpass", freq: 1600 });
}

function snare(ctx: AudioContext, dest: AudioNode, noise: AudioBuffer, time: number, velocity: number) {
  tone(ctx, dest, time, "triangle", 196, velocity * 0.38, 0.14, 130);
  burst(ctx, dest, noise, time, velocity * 0.55, 0.16, { type: "highpass", freq: 1400 });
  burst(ctx, dest, noise, time, velocity * 0.22, 0.12, { type: "bandpass", freq: 1800, q: 0.8 });
}

function hat(ctx: AudioContext, dest: AudioNode, noise: AudioBuffer, time: number, velocity: number) {
  const freq = 6800 + Math.random() * 500;
  burst(ctx, dest, noise, time, velocity * 0.28, 0.042, { type: "highpass", freq });
  const mix = ctx.createGain();
  const shape = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  shape.type = "bandpass";
  shape.frequency.value = 8500;
  shape.Q.value = 0.6;
  mix.gain.value = 0.35;
  gain.gain.setValueAtTime(velocity * 0.07, time);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.038);
  const oscs: OscillatorNode[] = [];
  for (const partial of [317, 493, 745]) {
    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.value = partial;
    osc.connect(mix);
    osc.start(time);
    osc.stop(time + 0.05);
    oscs.push(osc);
  }
  mix.connect(shape);
  shape.connect(gain);
  gain.connect(dest);
  oscs[0].onended = disconnectLater([mix, shape, gain, ...oscs]);
}

function perc(ctx: AudioContext, dest: AudioNode, time: number, velocity: number) {
  const shape = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  shape.type = "bandpass";
  shape.frequency.value = 1250;
  shape.Q.value = 5.5;
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(velocity * 0.42, time + 0.003);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.15);
  const oscs: OscillatorNode[] = [];
  for (const freq of [540, 812]) {
    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.value = freq;
    osc.connect(shape);
    osc.start(time);
    osc.stop(time + 0.16);
    oscs.push(osc);
  }
  shape.connect(gain);
  gain.connect(dest);
  oscs[0].onended = disconnectLater([shape, gain, ...oscs]);
}

export function triggerVoice(
  ctx: AudioContext,
  dest: AudioNode,
  noise: AudioBuffer,
  voice: TrackId,
  time: number,
  velocity = 1,
) {
  if (voice === "kick") kick(ctx, dest, noise, time, velocity);
  else if (voice === "snare") snare(ctx, dest, noise, time, velocity);
  else if (voice === "hat") hat(ctx, dest, noise, time, velocity);
  else perc(ctx, dest, time, velocity);
}
