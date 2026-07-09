/**
 * Sample Cache
 *
 * In-memory cache of sample audio per slot so selecting a pad never has to
 * wait for a device transfer twice. Two sources:
 *
 * - 'factory': preloaded from /factory_kit/ WAV files at app start
 * - 'device': downloaded from the DRUM via SDS, or just uploaded by the user
 *
 * Device entries always take precedence over factory entries.
 */

import { FACTORY_SAMPLES } from '$lib/config/factorySamples';
import { createLogger } from '$lib/utils/logger';

const logger = createLogger('SampleCache');

export type SampleSource = 'factory' | 'device';

export interface CachedSample {
  samples: Float32Array;
  sampleRate: number;
  source: SampleSource;
}

const cache = new Map<number, CachedSample>();

/** Get the cached sample for a slot; device entries win over factory ones. */
export function getCachedSample(slot: number): CachedSample | null {
  return cache.get(slot) ?? null;
}

/** True when we already hold the device's own audio for this slot. */
export function hasDeviceSample(slot: number): boolean {
  return cache.get(slot)?.source === 'device';
}

/**
 * Store a device-sourced sample (SDS download, or audio the user just
 * uploaded — after upload the device holds exactly this audio).
 */
export function cacheDeviceSample(slot: number, samples: Float32Array, sampleRate: number): void {
  cache.set(slot, { samples, sampleRate, source: 'device' });
}

let preloadPromise: Promise<void> | null = null;

/**
 * Fetch and decode all factory samples into the cache. Safe to call multiple
 * times; only runs once. Never overwrites device-sourced entries.
 */
export function preloadFactorySamples(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  preloadPromise ??= doPreload();
  return preloadPromise;
}

async function doPreload(): Promise<void> {
  const ctx = new AudioContext({ sampleRate: 44100 });
  let loaded = 0;

  await Promise.all(
    Object.entries(FACTORY_SAMPLES).map(async ([slotKey, filename]) => {
      const slot = Number(slotKey);
      try {
        const response = await fetch(`/factory_kit/${filename}`);
        if (!response.ok) {
          throw new Error(response.statusText);
        }
        const audioBuffer = await ctx.decodeAudioData(await response.arrayBuffer());
        let samples = audioBuffer.getChannelData(0);
        if (audioBuffer.numberOfChannels > 1) {
          const right = audioBuffer.getChannelData(1);
          samples = samples.map((v, i) => (v + right[i]) * 0.5);
        }
        if (!cache.has(slot)) {
          cache.set(slot, { samples, sampleRate: audioBuffer.sampleRate, source: 'factory' });
        }
        loaded++;
      } catch (error) {
        logger.warn(
          `Failed to preload factory sample ${filename}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    })
  );

  await ctx.close();
  logger.info(`Preloaded ${loaded}/${Object.keys(FACTORY_SAMPLES).length} factory samples`);
}
