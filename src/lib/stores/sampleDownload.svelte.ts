/**
 * Sample Download Store
 *
 * Manages sample download state for reading samples from the Dato DRUM
 * device via SDS Dump Request. Uses Svelte 5 runes for reactive state.
 *
 * The download is triggered when a note/slot is selected, and the
 * resulting sample data is made available for the SampleRecorder to
 * populate its waveform buffer.
 */

'use runes';

import { midiState } from './midi.svelte';
import {
  receiveSampleViaSds,
  initializeSdsListener,
  cleanupSdsListener,
  isTransferActive,
  sendCancel,
  type SdsDownloadProgress,
  type SdsDownloadResult
} from '$lib/services/sdsProtocol';
import { createLogger } from '$lib/utils/logger';

const logger = createLogger('SampleDownload');

export type DownloadStatus = 'idle' | 'downloading' | 'done' | 'empty' | 'error';

interface DownloadState {
  status: DownloadStatus;
  /** The slot currently being downloaded (or last downloaded) */
  slot: number | null;
  /** Progress percentage 0-100 */
  progress: number;
  /** Error message if status is 'error' */
  error: string | null;
  /** Downloaded sample data (Float32Array, normalized -1..1) */
  samples: Float32Array | null;
  /** Sample rate from the dump header */
  sampleRate: number;
}

const downloadState = $state<DownloadState>({
  status: 'idle',
  slot: null,
  progress: 0,
  error: null,
  samples: null,
  sampleRate: 44100
});

let abortController: AbortController | null = null;

/**
 * Download a sample from the device for the given slot.
 *
 * If another download is already running, it is aborted first.
 * If an upload is active, the download is rejected (device doesn't allow
 * concurrent transfers).
 *
 * @param slot - MIDI note number / slot (30-61)
 * @returns The download result, or null if the slot is empty
 */
async function downloadSample(slot: number): Promise<SdsDownloadResult | null> {
  // Abort any in-progress download
  if (abortController) {
    abortController.abort();
    abortController = null;
  }

  // Check MIDI connection
  if (!midiState.isConnected) {
    logger.warn('Cannot download: MIDI device not connected');
    return null;
  }

  // Check for concurrent upload
  if (isTransferActive()) {
    logger.warn('Cannot download: another SDS transfer is active');
    return null;
  }

  // Reset state
  downloadState.status = 'downloading';
  downloadState.slot = slot;
  downloadState.progress = 0;
  downloadState.error = null;
  downloadState.samples = null;

  abortController = new AbortController();
  const signal = abortController.signal;

  try {
    initializeSdsListener();

    const result = await receiveSampleViaSds(
      slot,
      (progress: SdsDownloadProgress) => {
        downloadState.progress = progress.percentage;
      },
      signal
    );

    if (result === null) {
      // Slot is empty
      downloadState.status = 'empty';
      downloadState.samples = null;
      logger.info(`Slot ${slot} is empty`);
      return null;
    }

    // Store the result
    downloadState.status = 'done';
    downloadState.samples = result.samples;
    downloadState.sampleRate = result.sampleRate;
    downloadState.progress = 100;
    logger.info(`Downloaded ${result.samples.length} samples from slot ${slot}`);

    return result;
  } catch (error) {
    if (signal.aborted) {
      // Aborted by a new download request — not a real error
      logger.debug(`Download of slot ${slot} aborted`);
      return null;
    }

    const message = error instanceof Error ? error.message : String(error);
    downloadState.status = 'error';
    downloadState.error = message;
    logger.error(`Download failed for slot ${slot}: ${message}`);
    return null;
  } finally {
    cleanupSdsListener();
    if (abortController?.signal === signal) {
      abortController = null;
    }
  }
}

/**
 * Cancel any in-progress download and send SDS CANCEL to the device.
 */
function cancelDownload(): void {
  if (abortController) {
    abortController.abort();
    abortController = null;
  }
  if (downloadState.status === 'downloading') {
    try {
      sendCancel();
    } catch {
      // Ignore send errors during cancel
    }
    downloadState.status = 'idle';
    downloadState.progress = 0;
  }
}

/**
 * Reset download state to idle (e.g. when navigating away).
 */
function resetDownload(): void {
  cancelDownload();
  downloadState.status = 'idle';
  downloadState.slot = null;
  downloadState.progress = 0;
  downloadState.error = null;
  downloadState.samples = null;
}

export { downloadState, downloadSample, cancelDownload, resetDownload };
