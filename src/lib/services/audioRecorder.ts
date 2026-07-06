/**
 * Audio Recorder Service
 *
 * This service handles microphone recording for the Dato DRUM device.
 * It records audio from the selected input device and converts it to the required format:
 * - Mono (1 channel)
 * - 16-bit PCM
 * - 44.1kHz sample rate
 * - Exactly 1 second duration
 *
 * The recorded audio is processed to match the ProcessedAudio interface,
 * allowing seamless integration with the existing sample upload system.
 */

import { createLogger } from '$lib/utils/logger';
import type { ProcessedAudio } from './audioProcessor';
import { resampleLinear, floatTo16BitPcm } from './audioAnalysis';

const logger = createLogger('AudioRecorder');

const TARGET_SAMPLE_RATE = 44100;
const RECORDING_DURATION_MS = 1000;
const MAX_SAMPLES = TARGET_SAMPLE_RATE; // 1 second at 44.1kHz

export interface RecordingOptions {
  /**
   * Optional device ID to record from.
   * If not provided, uses the default microphone.
   */
  deviceId?: string;
}

export interface RecordingProgress {
  /**
   * Recording stage: 'requesting' | 'waiting' | 'recording' | 'processing'
   */
  stage: 'requesting' | 'recording' | 'processing';

  /**
   * Progress percentage (0-100)
   */
  percentage: number;
}

/**
 * Record audio from microphone and process to DRUM-compatible format
 *
 * @param options - Recording options (device ID, threshold, etc.)
 * @param onProgress - Optional callback for progress updates
 * @returns Processed audio data ready for transfer
 * @throws Error if recording fails or microphone access is denied
 */
export async function recordAudio(
  options: RecordingOptions = {},
  onProgress?: (progress: RecordingProgress) => void
): Promise<ProcessedAudio> {
  logger.info('Starting audio recording...');

  // Request microphone access
  onProgress?.({ stage: 'requesting', percentage: 0 });

  let stream: MediaStream | null = null;

  try {
    // Get user media with constraints
    const constraints: MediaStreamConstraints = {
      audio: {
        channelCount: 1, // Request mono if possible
        sampleRate: TARGET_SAMPLE_RATE, // Request target sample rate
        echoCancellation: false, // Disable for direct audio capture
        noiseSuppression: false, // Disable for raw audio
        autoGainControl: false, // Disable for consistent levels
        ...(options.deviceId && { deviceId: { exact: options.deviceId } })
      }
    };

    stream = await navigator.mediaDevices.getUserMedia(constraints);
    logger.debug('Microphone access granted');

    onProgress?.({ stage: 'recording', percentage: 0 });

    const audioBlob = await recordForDuration(stream, RECORDING_DURATION_MS, onProgress);
    logger.debug(`Recorded ${audioBlob.size} bytes`);

    // Stop all tracks
    stream.getTracks().forEach(track => track.stop());
    stream = null;

    // Process the recorded audio
    onProgress?.({ stage: 'processing', percentage: 90 });

    const processedAudio = await processRecording(audioBlob);
    logger.info('Recording completed successfully');

    onProgress?.({ stage: 'processing', percentage: 100 });

    return processedAudio;
  } catch (error) {
    // Cleanup on error
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }

    logger.error(`Recording failed: ${error instanceof Error ? error.message : String(error)}`);

    if (error instanceof DOMException && error.name === 'NotAllowedError') {
      throw new Error('Microphone access denied. Please allow microphone access and try again.');
    }

    throw new Error(`Recording failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Record audio for a specific duration using MediaRecorder
 *
 * @param stream - MediaStream from getUserMedia
 * @param durationMs - Recording duration in milliseconds
 * @param onProgress - Optional callback for progress updates
 * @returns Audio blob containing the recorded data
 */
async function recordForDuration(
  stream: MediaStream,
  durationMs: number,
  onProgress?: (progress: RecordingProgress) => void
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const chunks: Blob[] = [];

    // Use audio/webm for broad browser support
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';

    const mediaRecorder = new MediaRecorder(stream, {
      mimeType,
      audioBitsPerSecond: 128000
    });

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    };

    mediaRecorder.onstop = () => {
      const audioBlob = new Blob(chunks, { type: mimeType });
      resolve(audioBlob);
    };

    mediaRecorder.onerror = (event) => {
      reject(new Error(`MediaRecorder error: ${event}`));
    };

    // Start recording
    mediaRecorder.start();
    logger.debug(`Recording started for ${durationMs}ms`);

    // Progress updates during recording
    const progressInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const percentage = Math.min((elapsed / durationMs) * 100, 100);
      onProgress?.({ stage: 'recording', percentage });
    }, 50); // Update every 50ms

    const startTime = Date.now();

    // Stop after duration
    setTimeout(() => {
      clearInterval(progressInterval);
      if (mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        logger.debug('Recording stopped');
      }
    }, durationMs);
  });
}

/**
 * Process recorded audio blob to DRUM-compatible format
 *
 * @param blob - Audio blob from MediaRecorder
 * @returns Processed audio data
 */
async function processRecording(blob: Blob): Promise<ProcessedAudio> {
  logger.info(`Processing recording: ${blob.size} bytes`);

  try {
    // Read blob as ArrayBuffer
    const arrayBuffer = await blob.arrayBuffer();

    // Create audio context
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

    try {
      // Decode audio data
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

      logger.debug(
        `Decoded: ${audioBuffer.numberOfChannels} channels, ${audioBuffer.sampleRate}Hz, ${audioBuffer.duration.toFixed(2)}s`
      );

      // Convert to mono
      let monoData: Float32Array;
      if (audioBuffer.numberOfChannels === 1) {
        monoData = audioBuffer.getChannelData(0);
      } else {
        // Mix down to mono by averaging all channels
        const left = audioBuffer.getChannelData(0);
        const right = audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : left;
        monoData = new Float32Array(left.length);
        for (let i = 0; i < left.length; i++) {
          monoData[i] = (left[i] + right[i]) * 0.5;
        }
        logger.debug('Converted to mono');
      }

      // Resample to 44.1kHz if needed
      let finalData = monoData;
      if (audioBuffer.sampleRate !== TARGET_SAMPLE_RATE) {
        logger.debug(`Resampling from ${audioBuffer.sampleRate}Hz to ${TARGET_SAMPLE_RATE}Hz`);
        finalData = resampleLinear(monoData, audioBuffer.sampleRate, TARGET_SAMPLE_RATE);
      }

      // Trim or pad to exactly 1 second
      if (finalData.length > MAX_SAMPLES) {
        logger.debug(`Trimming from ${finalData.length} to ${MAX_SAMPLES} samples`);
        finalData = finalData.slice(0, MAX_SAMPLES);
      } else if (finalData.length < MAX_SAMPLES) {
        logger.debug(`Padding from ${finalData.length} to ${MAX_SAMPLES} samples`);
        const padded = new Float32Array(MAX_SAMPLES);
        padded.set(finalData);
        // Remaining samples are 0 (silence)
        finalData = padded;
      }

      // Convert to 16-bit PCM (little-endian)
      const pcmData = floatTo16BitPcm(finalData);

      const duration = finalData.length / TARGET_SAMPLE_RATE;

      logger.info(
        `Processed: ${pcmData.byteLength} bytes, ${TARGET_SAMPLE_RATE}Hz, 16-bit mono, ${duration.toFixed(2)}s`
      );

      return {
        pcmData,
        sampleRate: TARGET_SAMPLE_RATE,
        duration,
        originalFileName: `recording-${Date.now()}.wav`
      };
    } finally {
      // Always close the audio context to free resources
      await audioContext.close();
    }
  } catch (error) {
    logger.error(
      `Failed to process recording: ${error instanceof Error ? error.message : String(error)}`
    );
    throw new Error(
      `Recording processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Check if the browser supports audio recording
 *
 * @returns True if MediaRecorder and getUserMedia are supported
 */
export function isRecordingSupported(): boolean {
  return !!(
    navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === 'function' &&
    typeof MediaRecorder !== 'undefined'
  );
}

/**
 * Request microphone permission without starting recording
 * Useful for permission requests in UI
 *
 * @param deviceId - Optional specific device to request
 * @returns True if permission granted
 */
export async function requestMicrophonePermission(deviceId?: string): Promise<boolean> {
  try {
    const constraints: MediaStreamConstraints = {
      audio: deviceId ? { deviceId: { exact: deviceId } } : true
    };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    // Stop immediately, we just wanted the permission
    stream.getTracks().forEach(track => track.stop());
    return true;
  } catch (error) {
    logger.warn(
      `Microphone permission denied: ${error instanceof Error ? error.message : String(error)}`
    );
    return false;
  }
}
