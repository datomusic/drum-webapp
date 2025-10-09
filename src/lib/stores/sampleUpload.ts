/**
 * Sample Upload Store
 *
 * Manages sample upload state, queue, and progress using Svelte 5 runes.
 * Handles:
 * - Upload queue management
 * - Progress tracking per sample
 * - Error handling
 * - Integration with SDS protocol and audio processing
 */

import { writable, derived, get } from 'svelte/store';
import { midiState } from './midi.svelte';
import { processAudioFile, isAudioFile, type ProcessedAudio, TARGET_SAMPLE_RATE } from '$lib/services/audioProcessor';
import { transferSampleViaSds, initializeSdsListener, cleanupSdsListener, type SdsProgress } from '$lib/services/sdsProtocol';
import { createLogger } from '$lib/utils/logger';

const logger = createLogger('SampleUpload');

export interface UploadQueueItem {
  id: string;
  file: File;
  targetSlot: number;
  status: 'pending' | 'processing' | 'uploading' | 'completed' | 'error';
  progress: number;
  error?: string;
  processedSize?: number;
  startTime?: number;
  endTime?: number;
}

interface UploadState {
  queue: UploadQueueItem[];
  isUploading: boolean;
  currentUploadId: string | null;
}

const initialState: UploadState = {
  queue: [],
  isUploading: false,
  currentUploadId: null
};

const { subscribe, set, update } = writable<UploadState>(initialState);

/**
 * Generate unique ID for upload items
 */
function generateUploadId(): string {
  return `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Add file to upload queue
 */
function addToQueue(file: File, targetSlot: number): string {
  if (!isAudioFile(file)) {
    throw new Error(`File ${file.name} is not a supported audio format`);
  }

  if (targetSlot < 30 || targetSlot > 61) {
    throw new Error(`Invalid slot number: ${targetSlot}. Must be between 30-61`);
  }

  const id = generateUploadId();

  update(state => {
    // Check if slot is already in queue
    const existingSlot = state.queue.find(item =>
      item.targetSlot === targetSlot &&
      (item.status === 'pending' || item.status === 'processing' || item.status === 'uploading')
    );

    if (existingSlot) {
      throw new Error(`Slot ${targetSlot} is already being uploaded`);
    }

    return {
      ...state,
      queue: [...state.queue, {
        id,
        file,
        targetSlot,
        status: 'pending',
        progress: 0
      }]
    };
  });

  logger.info(`Added ${file.name} to upload queue for slot ${targetSlot}`);
  return id;
}

/**
 * Remove item from queue
 */
function removeFromQueue(id: string): void {
  update(state => ({
    ...state,
    queue: state.queue.filter(item => item.id !== id)
  }));
}

/**
 * Clear completed and errored uploads from queue
 */
function clearCompleted(): void {
  update(state => ({
    ...state,
    queue: state.queue.filter(item =>
      item.status !== 'completed' && item.status !== 'error'
    )
  }));
}

/**
 * Update upload progress
 */
function updateProgress(id: string, progress: number, status?: UploadQueueItem['status']): void {
  update(state => ({
    ...state,
    queue: state.queue.map(item =>
      item.id === id
        ? { ...item, progress, ...(status && { status }) }
        : item
    )
  }));
}

/**
 * Update upload status
 */
function updateStatus(id: string, status: UploadQueueItem['status'], error?: string): void {
  update(state => ({
    ...state,
    queue: state.queue.map(item =>
      item.id === id
        ? {
            ...item,
            status,
            ...(error && { error }),
            ...(status === 'completed' && { endTime: Date.now(), progress: 100 })
          }
        : item
    )
  }));
}

/**
 * Process and upload a single sample
 */
async function uploadSample(item: UploadQueueItem): Promise<void> {
  const { id, file, targetSlot } = item;

  try {
    // Check MIDI connection
    const { isConnected } = midiState;
    if (!isConnected) {
      throw new Error('MIDI device not connected');
    }

    // Initialize SDS listener
    initializeSdsListener();

    // Update status to processing
    update(state => ({
      ...state,
      queue: state.queue.map(i =>
        i.id === id ? { ...i, status: 'processing', startTime: Date.now() } : i
      )
    }));

    let processed: ProcessedAudio;

    // If the file is raw PCM data from the recorder, we can skip processing
    if (file.type === 'audio/x-raw-pcm') {
      logger.info(`Skipping audio processing for pre-processed file: ${file.name}`);
      const pcmData = new Uint8Array(await file.arrayBuffer());
      processed = {
        pcmData,
        sampleRate: TARGET_SAMPLE_RATE,
        duration: pcmData.length / (TARGET_SAMPLE_RATE * 2), // 2 bytes per sample
        originalFileName: file.name
      };
    } else {
      logger.info(`Processing audio file: ${file.name}`);
      processed = await processAudioFile(file);
    }



    update(state => ({
      ...state,
      queue: state.queue.map(i =>
        i.id === id ? { ...i, processedSize: processed.pcmData.length } : i
      )
    }));

    // Update status to uploading
    updateStatus(id, 'uploading');
    updateProgress(id, 0, 'uploading');

    logger.info(`Uploading to slot ${targetSlot}...`);

    // Transfer via SDS
    await transferSampleViaSds(
      processed.pcmData,
      targetSlot,
      processed.sampleRate,
      (progress: SdsProgress) => {
        // Map SDS progress to our progress system
        let overallProgress = 0;
        if (progress.stage === 'header') {
          overallProgress = 5;
        } else if (progress.stage === 'data') {
          overallProgress = 5 + (progress.percentage * 0.95);
        } else if (progress.stage === 'complete') {
          overallProgress = 100;
        }
        updateProgress(id, overallProgress, 'uploading');
      }
    );

    // Mark as completed
    updateStatus(id, 'completed');
    logger.info(`Successfully uploaded ${file.name} to slot ${targetSlot}`);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    updateStatus(id, 'error', errorMessage);
    logger.error(`Upload failed for ${file.name}: ${errorMessage}`);
    throw error;
  }
}

/**
 * Start processing the upload queue
 */
async function startQueue(): Promise<void> {
  const state = get({ subscribe });

  if (state.isUploading) {
    logger.warn('Upload already in progress');
    return;
  }

  const pendingItems = state.queue.filter(item => item.status === 'pending');

  if (pendingItems.length === 0) {
    logger.warn('No pending uploads in queue');
    return;
  }

  update(s => ({ ...s, isUploading: true }));

  logger.info(`Starting upload queue: ${pendingItems.length} items`);

  for (const item of pendingItems) {
    update(s => ({ ...s, currentUploadId: item.id }));

    try {
      await uploadSample(item);
    } catch (error) {
      // Error already logged and status updated in uploadSample
      // Continue with next item
    }
  }

  update(s => ({ ...s, isUploading: false, currentUploadId: null }));

  // Cleanup SDS listener
  cleanupSdsListener();

  logger.info('Upload queue completed');
}

/**
 * Cancel current upload and clear queue
 */
function cancelQueue(): void {
  update(state => ({
    queue: state.queue.map(item =>
      item.status === 'pending' || item.status === 'processing' || item.status === 'uploading'
        ? { ...item, status: 'error', error: 'Cancelled by user' }
        : item
    ),
    isUploading: false,
    currentUploadId: null
  }));

  cleanupSdsListener();
  logger.info('Upload queue cancelled');
}

/**
 * Quick upload function - add to queue and start immediately
 */
async function quickUpload(file: File, targetSlot: number): Promise<void> {
  const id = addToQueue(file, targetSlot);
  await startQueue();
}

// Derived stores for UI convenience
export const uploadQueue = derived(
  { subscribe },
  $state => $state.queue
);

export const isUploading = derived(
  { subscribe },
  $state => $state.isUploading
);

export const currentUpload = derived(
  { subscribe },
  $state => $state.queue.find(item => item.id === $state.currentUploadId) || null
);

export const pendingCount = derived(
  { subscribe },
  $state => $state.queue.filter(item => item.status === 'pending').length
);

export const completedCount = derived(
  { subscribe },
  $state => $state.queue.filter(item => item.status === 'completed').length
);

export const errorCount = derived(
  { subscribe },
  $state => $state.queue.filter(item => item.status === 'error').length
);

// Export the store with actions
export const sampleUploadStore = {
  subscribe,
  addToQueue,
  removeFromQueue,
  clearCompleted,
  startQueue,
  cancelQueue,
  quickUpload
};
