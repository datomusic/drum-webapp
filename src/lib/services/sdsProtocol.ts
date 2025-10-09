/**
 * MIDI Sample Dump Standard (SDS) Protocol Implementation
 *
 * This service implements the MIDI SDS protocol for reliable sample transfer
 * to the Dato DRUM device. It handles:
 * - Dump header creation
 * - Data packet encoding with checksum validation
 * - ACK/NAK handshaking with timeout fallback
 * - Progress monitoring
 */

import { get } from 'svelte/store';
import { midiStore } from '$lib/stores/midi';
import { createLogger } from '$lib/utils/logger';

const logger = createLogger('SDS');

// MIDI SDS Constants
const SYSEX_START = 0xF0;
const SYSEX_END = 0xF7;
const MIDI_NON_REALTIME_ID = 0x7E;
const SYSEX_CHANNEL = 0x65; // DRUM device channel

// SDS Message Types
const SDS_DUMP_HEADER = 0x01;
const SDS_DATA_PACKET = 0x02;
const SDS_ACK = 0x7F;
const SDS_NAK = 0x7E;
const SDS_CANCEL = 0x7D;
const SDS_WAIT = 0x7C;

// Timeouts
const PACKET_TIMEOUT = 20;   // 20ms per packet as per SDS spec
const HEADER_TIMEOUT = 2000; // 2 second timeout for dump header

// Response handling
interface SdsResponse {
  type: 'ack' | 'nak' | 'wait' | 'cancel' | 'timeout';
  packet: number;
}

let pendingResponse: {
  resolve: (response: SdsResponse) => void;
  timer: number;
} | null = null;

let messageHandler: ((this: MIDIInput, ev: MIDIMessageEvent) => any) | null = null;

/**
 * Check if a MIDI message is an SDS message
 */
function isSdsMessage(message: Uint8Array): boolean {
  return message[0] === SYSEX_START &&
         message[message.length - 1] === SYSEX_END &&
         message.length >= 6 &&
         message[1] === MIDI_NON_REALTIME_ID &&
         message[2] === SYSEX_CHANNEL;
}

/**
 * Handle incoming MIDI messages for SDS responses
 */
function handleMidiMessage(this: MIDIInput, event: MIDIMessageEvent): void {
  const message = event.data;

  if (!message) {
    return;
  }

  if (isSdsMessage(message)) {
    const messageType = message[3];
    const packetNum = message.length > 4 ? message[4] : 0;

    // Handle responses during handshaking
    if (pendingResponse && (messageType === SDS_ACK || messageType === SDS_NAK ||
                           messageType === SDS_WAIT || messageType === SDS_CANCEL)) {
      clearTimeout(pendingResponse.timer);

      let type: 'ack' | 'nak' | 'wait' | 'cancel';
      if (messageType === SDS_ACK) type = 'ack';
      else if (messageType === SDS_NAK) type = 'nak';
      else if (messageType === SDS_WAIT) type = 'wait';
      else type = 'cancel';

      pendingResponse.resolve({ type, packet: packetNum });
      pendingResponse = null;
    }
  }
}

/**
 * Initialize SDS message listener
 */
export function initializeSdsListener(): void {
  const { selectedInput } = get(midiStore);

  if (!selectedInput) {
    logger.warn('No MIDI input selected for SDS listener');
    return;
  }

  // Remove existing handler if any
  if (messageHandler) {
    selectedInput.removeEventListener('midimessage', messageHandler);
  }

  // Add new handler
  messageHandler = handleMidiMessage;
  selectedInput.addEventListener('midimessage', messageHandler);

  logger.info('SDS message listener initialized');
}

/**
 * Clean up SDS message listener
 */
export function cleanupSdsListener(): void {
  const { selectedInput } = get(midiStore);

  if (selectedInput && messageHandler) {
    selectedInput.removeEventListener('midimessage', messageHandler);
    messageHandler = null;
  }
}

/**
 * Send SDS message via MIDI output
 */
function sendSdsMessage(data: number[]): void {
  const { selectedOutput } = get(midiStore);

  if (!selectedOutput) {
    throw new Error('No MIDI output selected');
  }

  const message = [SYSEX_START, MIDI_NON_REALTIME_ID, SYSEX_CHANNEL, ...data, SYSEX_END];
  selectedOutput.send(message);
}

/**
 * Wait for SDS response with timeout
 */
function waitForResponse(timeout: number, packetNum: number = 0): Promise<SdsResponse> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      pendingResponse = null;
      resolve({ type: 'timeout', packet: packetNum });
    }, timeout);

    pendingResponse = { resolve, timer };
  });
}

/**
 * Convert sample rate to SDS period format (3-byte nanosecond period)
 */
function sampleRateToPeriod(sampleRate: number): number[] {
  const periodNs = Math.round(1000000000 / sampleRate);
  return [
    periodNs & 0x7F,           // bits 0-6
    (periodNs >> 7) & 0x7F,    // bits 7-13
    (periodNs >> 14) & 0x7F    // bits 14-20
  ];
}

/**
 * Convert length to SDS 3-byte format (word count, where word = 2 bytes)
 */
function lengthToSdsFormat(byteLength: number): number[] {
  const wordLength = Math.floor(byteLength / 2); // SDS uses word count
  return [
    wordLength & 0x7F,         // bits 0-6
    (wordLength >> 7) & 0x7F,  // bits 7-13
    (wordLength >> 14) & 0x7F  // bits 14-20
  ];
}

/**
 * Create SDS Dump Header
 */
function createDumpHeader(
  sampleNum: number,
  bitDepth: number,
  sampleRate: number,
  sampleLength: number
): number[] {
  const sampleNumBytes = [sampleNum & 0x7F, (sampleNum >> 7) & 0x7F];
  const periodBytes = sampleRateToPeriod(sampleRate);
  const lengthBytes = lengthToSdsFormat(sampleLength);

  // Loop points set to no-loop (start and end = length, type = 0x7F)
  const loopStartBytes = lengthBytes.slice(); // Copy length
  const loopEndBytes = lengthBytes.slice();   // Copy length
  const loopType = 0x7F; // No loop

  return [
    SDS_DUMP_HEADER,
    ...sampleNumBytes,    // sl sh - sample number
    bitDepth,             // ee - bits per sample
    ...periodBytes,       // pl pm ph - sample period in nanoseconds
    ...lengthBytes,       // gl gm gh - length in words
    ...loopStartBytes,    // hl hm hh - loop start (set to length for no-loop)
    ...loopEndBytes,      // il im ih - loop end (set to length for no-loop)
    loopType              // jj - loop type (0x7F = no loop)
  ];
}

/**
 * Pack 16-bit sample into SDS 3-byte format
 */
function pack16BitSample(sample: number): number[] {
  // Convert signed to unsigned (SDS uses 0x0000 as full negative)
  const unsignedSample = sample + 0x8000;

  // Pack into 3 bytes (left-justified)
  return [
    (unsignedSample >> 9) & 0x7F,  // bits 15-9
    (unsignedSample >> 2) & 0x7F,  // bits 8-2
    (unsignedSample << 5) & 0x7F   // bits 1-0 (left-shifted to bits 6-5)
  ];
}

/**
 * Calculate XOR checksum for data packet
 */
function calculateChecksum(packetNum: number, dataBytes: number[]): number {
  let checksum = MIDI_NON_REALTIME_ID ^ SYSEX_CHANNEL ^ SDS_DATA_PACKET ^ packetNum;
  for (const byte of dataBytes) {
    checksum ^= byte;
  }
  return checksum & 0x7F; // Clear high bit
}

/**
 * Create SDS Data Packet
 */
function createDataPacket(packetNum: number, pcmData: Uint8Array, offset: number): number[] {
  const dataBytes: number[] = [];

  // Pack up to 40 16-bit samples (120 bytes)
  for (let i = 0; i < 40; i++) {
    const sampleOffset = offset + (i * 2);
    if (sampleOffset + 1 < pcmData.length) {
      // Read 16-bit little-endian sample
      const sample = (pcmData[sampleOffset + 1] << 8) | pcmData[sampleOffset];
      // Convert to signed
      const signedSample = sample > 32767 ? sample - 65536 : sample;
      dataBytes.push(...pack16BitSample(signedSample));
    } else {
      // Pad with zeros if we're at the end
      dataBytes.push(0, 0, 0);
    }
  }

  // Ensure exactly 120 bytes
  while (dataBytes.length < 120) {
    dataBytes.push(0);
  }
  dataBytes.length = 120;

  const checksum = calculateChecksum(packetNum, dataBytes);

  return [
    SDS_DATA_PACKET,
    packetNum & 0x7F,
    ...dataBytes,
    checksum
  ];
}

/**
 * Progress callback type
 */
export interface SdsProgress {
  stage: 'header' | 'data' | 'complete';
  packet?: number;
  totalPackets?: number;
  percentage: number;
  handshaking: boolean;
}

/**
 * Transfer sample using SDS protocol
 *
 * @param pcmData - Raw PCM data (16-bit little-endian, mono)
 * @param sampleNumber - Target slot number (30-61)
 * @param sampleRate - Sample rate in Hz (default: 44100)
 * @param onProgress - Progress callback
 */
export async function transferSampleViaSds(
  pcmData: Uint8Array,
  sampleNumber: number,
  sampleRate: number = 44100,
  onProgress?: (progress: SdsProgress) => void
): Promise<void> {
  // Validate sample number
  if (sampleNumber < 30 || sampleNumber > 61) {
    throw new Error(`Sample number must be between 30-61, got: ${sampleNumber}`);
  }

  logger.info(`Starting SDS transfer: slot ${sampleNumber}, ${pcmData.length} bytes, ${sampleRate}Hz`);

  const totalPackets = Math.ceil(pcmData.length / 80); // 40 samples * 2 bytes per packet

  try {
    // Step 1: Send Dump Header
    logger.debug('Sending dump header...');
    const header = createDumpHeader(sampleNumber, 16, sampleRate, pcmData.length);
    sendSdsMessage(header);

    if (onProgress) {
      onProgress({ stage: 'header', percentage: 0, handshaking: false });
    }

    const headerResponse = await waitForResponse(HEADER_TIMEOUT);
    if (headerResponse.type === 'nak') {
      logger.debug('Header NAK received, retrying...');
      sendSdsMessage(header);
      const retryResponse = await waitForResponse(HEADER_TIMEOUT);
      if (retryResponse.type !== 'ack' && retryResponse.type !== 'timeout') {
        throw new Error('Header rejected twice');
      }
    }

    let handshaking = headerResponse.type === 'ack';
    logger.info(`Header ${headerResponse.type} - ${handshaking ? 'handshaking' : 'non-handshaking'} mode`);

    // Step 2: Send Data Packets
    logger.debug('Sending data packets...');
    let packetNum = 0;
    let offset = 0;
    let successfulPackets = 0;

    while (offset < pcmData.length) {
      const packet = createDataPacket(packetNum & 0x7F, pcmData, offset);
      sendSdsMessage(packet);

      if (handshaking) {
        const response = await waitForResponse(PACKET_TIMEOUT, packetNum & 0x7F);

        if (response.type === 'ack') {
          successfulPackets++;
          offset += 80; // Move to next 40 samples (80 bytes)
          packetNum++;
        } else if (response.type === 'nak') {
          logger.debug(`Packet ${packetNum & 0x7F} NAK - retrying`);
          continue; // Retry same packet
        } else if (response.type === 'wait') {
          logger.debug(`Packet ${packetNum & 0x7F} WAIT - device busy`);
          // Wait for final response after WAIT
          const finalResponse = await waitForResponse(30000, packetNum & 0x7F);
          if (finalResponse.type === 'ack') {
            successfulPackets++;
            offset += 80;
            packetNum++;
          } else if (finalResponse.type === 'nak') {
            continue; // Retry same packet
          } else if (finalResponse.type === 'cancel') {
            throw new Error('Device cancelled transfer - storage may be full');
          } else {
            // Timeout after WAIT - assume non-handshaking
            logger.debug('Timeout after WAIT - switching to non-handshaking');
            successfulPackets++;
            offset += 80;
            packetNum++;
            handshaking = false;
          }
        } else if (response.type === 'cancel') {
          throw new Error('Device cancelled transfer - storage may be full');
        } else {
          // Timeout - assume non-handshaking mode
          logger.debug(`Packet ${packetNum & 0x7F} timeout - switching to non-handshaking`);
          successfulPackets++;
          offset += 80;
          packetNum++;
          handshaking = false;
        }
      } else {
        // Non-handshaking mode - advance immediately
        successfulPackets++;
        offset += 80;
        packetNum++;
      }

      // Update progress
      if (onProgress) {
        const percentage = Math.min(100, (successfulPackets / totalPackets) * 100);
        onProgress({
          stage: 'data',
          packet: successfulPackets,
          totalPackets,
          percentage,
          handshaking
        });
      }
    }

    logger.info(`Transfer complete: ${successfulPackets} packets sent`);

    if (onProgress) {
      onProgress({
        stage: 'complete',
        packet: successfulPackets,
        totalPackets,
        percentage: 100,
        handshaking
      });
    }
  } catch (error) {
    logger.error('SDS transfer failed: ' + (error instanceof Error ? error.message : String(error)));
    throw error;
  }
}
