/**
 * Slot Sample Loader
 *
 * Orchestrates loading a pad's audio into the editor when its slot is
 * selected: show cached audio (factory/device/upload) instantly, then — if
 * the 'downloadOnSelect' feature flag is on and we don't already hold the
 * device's own audio for this slot — download it and load that in too,
 * provided the user hasn't since selected a different slot.
 */

import { getCachedSample, hasDeviceSample } from '$lib/stores/sampleCache';
import { downloadState, downloadSample } from '$lib/stores/sampleDownload.svelte';
import { featureFlags } from '$lib/stores/featureFlags.svelte';
import { createLogger } from '$lib/utils/logger';

const logger = createLogger('SlotSampleLoader');

export interface LoadSlotSampleOptions {
  /** Whether `slot` is still the selected slot (checked before applying a download result). */
  isSlotStillSelected: (slot: number) => boolean;
  /** Called with sample data to load into the editor. */
  onSamples: (samples: Float32Array, sampleRate: number, source: string) => void;
}

/**
 * Load the given slot's sample(s) into the editor: cache hit first, then an
 * optional device download. Never throws — download errors are logged and
 * swallowed (they're also already reflected in `downloadState`).
 */
export async function loadSlotSample(slot: number, opts: LoadSlotSampleOptions): Promise<void> {
  const cached = getCachedSample(slot);
  if (cached) {
    opts.onSamples(cached.samples, cached.sampleRate, cached.source);
    logger.info(`Loaded ${cached.source} sample for slot ${slot} from cache`);
  }

  if (!featureFlags.downloadOnSelect || hasDeviceSample(slot)) return;

  try {
    const result = await downloadSample(slot);
    if (result && result.samples.length > 0) {
      // Only load if the user hasn't moved on to another slot meanwhile
      if (opts.isSlotStillSelected(slot)) {
        opts.onSamples(result.samples, result.sampleRate, 'download');
        logger.info(`Loaded downloaded sample for slot ${slot} into buffer`);
      }
    } else if (downloadState.status === 'empty') {
      logger.info(`Slot ${slot} is empty on device`);
    }
  } catch (error) {
    // Errors are already logged and stored in downloadState
    logger.debug(`Download error for slot ${slot}: ${error}`);
  }
}
