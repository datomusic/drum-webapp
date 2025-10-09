/**
 * Audio Processing Service
 *
 * This service handles audio file processing for the Dato DRUM device.
 * It converts audio files to the required format:
 * - Mono (1 channel)
 * - 16-bit PCM
 * - 44.1kHz sample rate
 * - Maximum 1 second duration
 *
 * Based on the audio processing from drum_sample_uploader.html
 */

import { createLogger } from '$lib/utils/logger';

const logger = createLogger('AudioProcessor');

export const TARGET_SAMPLE_RATE = 44100;
const TARGET_BIT_DEPTH = 16;
const MAX_DURATION_SECONDS = 1;
const MAX_SAMPLES = TARGET_SAMPLE_RATE * MAX_DURATION_SECONDS;

export interface ProcessedAudio {
  pcmData: Uint8Array;
  sampleRate: number;
  duration: number;
  originalFileName: string;
}

/**
 * Process audio file to DRUM-compatible format
 *
 * @param file - Audio file (WAV, MP3, etc.)
 * @returns Processed audio data ready for transfer
 */
export async function processAudioFile(file: File): Promise<ProcessedAudio> {
  logger.info(`Processing audio file: ${file.name} (${file.size} bytes)`);

  try {
    // Read file as ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();

    // Create audio context
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

    try {
      // Decode audio data
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

      logger.debug(`Decoded: ${audioBuffer.numberOfChannels} channels, ${audioBuffer.sampleRate}Hz, ${audioBuffer.duration.toFixed(2)}s`);

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
        finalData = resample(monoData, audioBuffer.sampleRate, TARGET_SAMPLE_RATE);
      }

      // Trim to maximum 1 second
      if (finalData.length > MAX_SAMPLES) {
        logger.debug(`Trimming from ${finalData.length} to ${MAX_SAMPLES} samples (1 second)`);
        finalData = finalData.slice(0, MAX_SAMPLES);
      }

      // Convert to 16-bit PCM (little-endian)
      const pcmBuffer = new ArrayBuffer(finalData.length * 2);
      const pcmView = new DataView(pcmBuffer);

      for (let i = 0; i < finalData.length; i++) {
        // Clamp to [-1, 1] range
        const sample = Math.max(-1, Math.min(1, finalData[i]));
        // Convert to 16-bit integer
        const intSample = Math.round(sample * 32767);
        // Write as little-endian
        pcmView.setInt16(i * 2, intSample, true);
      }

      const duration = finalData.length / TARGET_SAMPLE_RATE;

      logger.info(`Processed: ${pcmBuffer.byteLength} bytes, ${TARGET_SAMPLE_RATE}Hz, 16-bit mono, ${duration.toFixed(2)}s`);

      return {
        pcmData: new Uint8Array(pcmBuffer),
        sampleRate: TARGET_SAMPLE_RATE,
        duration,
        originalFileName: file.name
      };
    } finally {
      // Always close the audio context to free resources
      await audioContext.close();
    }
  } catch (error) {
    logger.error(`Failed to process audio file: ${error instanceof Error ? error.message : String(error)}`);
    throw new Error(`Audio processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Resample audio data using linear interpolation
 *
 * @param inputData - Input audio samples (Float32Array)
 * @param inputSampleRate - Input sample rate
 * @param outputSampleRate - Output sample rate
 * @returns Resampled audio data
 */
function resample(
  inputData: Float32Array,
  inputSampleRate: number,
  outputSampleRate: number
): Float32Array {
  const ratio = inputSampleRate / outputSampleRate;
  const outputLength = Math.round(inputData.length / ratio);
  const output = new Float32Array(outputLength);

  for (let i = 0; i < outputLength; i++) {
    const inputIndex = i * ratio;
    const inputIndexInt = Math.floor(inputIndex);
    const fraction = inputIndex - inputIndexInt;

    if (inputIndexInt + 1 < inputData.length) {
      // Linear interpolation between two samples
      output[i] = inputData[inputIndexInt] * (1 - fraction) +
                 inputData[inputIndexInt + 1] * fraction;
    } else {
      // At the end, just use the last sample
      output[i] = inputData[inputIndexInt] || 0;
    }
  }

  return output;
}

/**
 * Validate if a file is a supported audio format
 *
 * @param file - File to validate
 * @returns True if file appears to be audio
 */
export function isAudioFile(file: File): boolean {
  const audioMimeTypes = [
    'audio/wav',
    'audio/wave',
    'audio/x-wav',
    'audio/mpeg',
    'audio/mp3',
    'audio/ogg',
    'audio/webm',
    'audio/flac',
    'audio/aac',
    'audio/m4a'
  ];

  const audioExtensions = [
    '.wav',
    '.mp3',
    '.ogg',
    '.webm',
    '.flac',
    '.aac',
    '.m4a'
  ];

  // Check MIME type
  if (audioMimeTypes.includes(file.type.toLowerCase())) {
    return true;
  }

  // Check file extension as fallback
  const fileName = file.name.toLowerCase();
  return audioExtensions.some(ext => fileName.endsWith(ext));
}

/**
 * Format file size for display
 *
 * @param bytes - Size in bytes
 * @returns Formatted string (e.g., "1.2 MB")
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
