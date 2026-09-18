/**
 * Pure audio analysis and conversion helpers.
 *
 * No DOM, Web Audio, or Svelte dependencies — everything in here operates on
 * plain Float32Arrays so it can be unit-tested in isolation. Used by the
 * sample recorder (envelope/transient analysis for auto-trim) and the audio
 * recorder service (resampling, PCM conversion).
 */

export interface Envelope {
  rms: Float32Array;
  hopMs: number;
  noiseFloor: number;
  peak: number;
}

/**
 * Short-time RMS energy envelope: 10ms windows at a 5ms hop, with the
 * noise floor estimated as the 20th percentile of frame energies.
 */
export function computeEnvelope(samples: Float32Array, sampleRate: number): Envelope | null {
  const hop = Math.floor(sampleRate * 0.005); // 5ms hop
  const win = Math.floor(sampleRate * 0.01); // 10ms window
  const frameCount = Math.floor((samples.length - win) / hop);
  if (frameCount < 10) return null;

  const rms = new Float32Array(frameCount);
  for (let f = 0; f < frameCount; f++) {
    let sum = 0;
    const start = f * hop;
    for (let i = start; i < start + win; i++) {
      sum += samples[i] * samples[i];
    }
    rms[f] = Math.sqrt(sum / win);
  }

  const peak = Math.max(...rms);
  const sorted = Array.from(rms).sort((a, b) => a - b);
  const noiseFloor = sorted[Math.floor(frameCount * 0.2)];

  return { rms, hopMs: 5, noiseFloor, peak };
}

/**
 * Find the first significant transient in the envelope. A frame only
 * counts as the onset when the energy stays up for a while afterwards
 * (sustain check), so a tiny click won't trigger it, and onsets too
 * close to the end of the buffer are ignored.
 *
 * Returns the frame index of the onset, or null if none found.
 */
export function findFirstTransient(env: Envelope): number | null {
  const { rms, noiseFloor, peak } = env;
  if (peak < 1e-4) return null; // effectively silence

  // Onset must clear both the noise floor and a fraction of the loudest
  // moment, so quiet rumble or a faint blip doesn't count
  const threshold = Math.max(noiseFloor * 4, peak * 0.15);

  const sustainFrames = 6; // 30ms
  const minRemainingFrames = 10; // ignore onsets in the last 50ms

  for (let f = 0; f < rms.length - minRemainingFrames; f++) {
    if (rms[f] < threshold) continue;

    // Sustain check: average energy over the next 30ms must hold up
    let sum = 0;
    const end = Math.min(rms.length, f + sustainFrames);
    for (let i = f; i < end; i++) sum += rms[i];
    if (sum / (end - f) >= threshold * 0.6) {
      return f;
    }
  }

  return null;
}

/**
 * Find where the sound has decayed after the onset, so the end marker
 * lands in a quiet spot instead of cutting a transient. Scans forward
 * from the onset for the last point where energy drops near the noise
 * floor and stays there briefly. Returns the frame to end at, or null
 * when the sound is still going at maxFrame (keep the full window).
 */
export function findQuietEnd(env: Envelope, onsetFrame: number, maxFrame: number): number | null {
  const { rms, noiseFloor, peak } = env;
  const releaseThreshold = Math.max(noiseFloor * 2, peak * 0.05);
  const quietFrames = 8; // must stay quiet for 40ms

  // Last frame with significant energy before maxFrame
  let lastLoud = onsetFrame;
  for (let f = onsetFrame; f < Math.min(maxFrame, rms.length); f++) {
    if (rms[f] >= releaseThreshold) lastLoud = f;
  }

  // Confirm it actually decays after that point
  let quietRun = 0;
  for (let f = lastLoud + 1; f < Math.min(maxFrame, rms.length); f++) {
    if (rms[f] < releaseThreshold) {
      quietRun++;
      if (quietRun >= quietFrames) return f;
    } else {
      quietRun = 0;
    }
  }

  return null;
}

/**
 * Resample audio data using linear interpolation.
 */
export function resampleLinear(
  input: Float32Array,
  fromRate: number,
  toRate: number
): Float32Array {
  const ratio = fromRate / toRate;
  const output = new Float32Array(Math.round(input.length / ratio));
  for (let i = 0; i < output.length; i++) {
    const pos = i * ratio;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    const next = idx + 1 < input.length ? input[idx + 1] : input[idx] || 0;
    output[i] = (input[idx] || 0) * (1 - frac) + next * frac;
  }
  return output;
}

/**
 * Decode an audio file to mono, optionally resampled to a target sample
 * rate. Downmixes by averaging all channels (2-channel behavior matches
 * the original stereo-to-mono average). Always closes the AudioContext it
 * creates.
 */
export async function decodeToMono(
  arrayBuffer: ArrayBuffer,
  targetSampleRate?: number
): Promise<{ samples: Float32Array; sampleRate: number }> {
  const ctx = new AudioContext();
  try {
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    let samples: Float32Array;
    if (audioBuffer.numberOfChannels === 1) {
      samples = audioBuffer.getChannelData(0);
    } else {
      const channels = Array.from({ length: audioBuffer.numberOfChannels }, (_, ch) =>
        audioBuffer.getChannelData(ch)
      );
      samples = new Float32Array(audioBuffer.length);
      for (let i = 0; i < samples.length; i++) {
        let sum = 0;
        for (const channel of channels) sum += channel[i];
        samples[i] = sum / channels.length;
      }
    }

    let sampleRate = audioBuffer.sampleRate;
    if (targetSampleRate !== undefined && sampleRate !== targetSampleRate) {
      samples = resampleLinear(samples, sampleRate, targetSampleRate);
      sampleRate = targetSampleRate;
    }

    return { samples, sampleRate };
  } finally {
    await ctx.close();
  }
}

/**
 * Convert float samples in [-1, 1] to 16-bit little-endian PCM,
 * clamping out-of-range values.
 */
export function floatTo16BitPcm(samples: Float32Array): Uint8Array {
  const buffer = new ArrayBuffer(samples.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(i * 2, Math.round(clamped * 32767), true);
  }
  return new Uint8Array(buffer);
}
