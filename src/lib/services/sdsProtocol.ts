/**
 * MIDI Sample Dump Standard (SDS) Protocol Implementation
 *
 * This service implements the MIDI SDS protocol for reliable sample transfer
 * to the Dato DRUM device. It handles:
 * - Dump header creation
 * - Data packet encoding with checksum validation
 * - ACK/NAK handshaking with per-packet retransmission
 * - Progress monitoring
 *
 * Mirrors the transfer logic of tools/drumtool/drumtool.js in the firmware
 * repository. Roughly 2% of USB MIDI packets are lost in flight, and the
 * device NAKs and discards anything out of sequence, so a lost packet must be
 * retransmitted: advancing past it loses the rest of the sample.
 */

import { midiState, addSysexListener } from '$lib/stores/midi.svelte';
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
const PACKET_TIMEOUT = 500;         // Per-attempt wait for a packet's ACK
const PACKET_RETRY_WINDOW = 5000;   // Give up on a packet after this long without any response
const HEADER_TIMEOUT = 2000;        // Wait for the dump header's ACK
const HEADER_ATTEMPTS = 3;          // Header sends before assuming a non-handshaking device
const WAIT_RESPONSE_TIMEOUT = 30000; // Deadline for the follow-up after a WAIT
const OPEN_LOOP_PACKET_DELAY = 10;  // Pacing between packets when the device never ACKs

// Response handling
interface SdsResponse {
  type: 'ack' | 'nak' | 'wait' | 'cancel' | 'timeout';
  packet: number;
}

let pendingResponse: {
  resolve: (response: SdsResponse) => void;
  timer: number;
} | null = null;

let unsubscribeSysex: (() => void) | null = null;

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
 * Handle incoming SysEx messages for SDS responses
 */
function handleSysexMessage(message: Uint8Array): void {
  if (!isSdsMessage(message)) {
    return;
  }

  const messageType = message[3];
  const packetNum = message.length > 4 ? message[4] : 0;

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

/**
 * Initialize SDS message listener
 *
 * Registers with the MIDI store's SysEx dispatch rather than adding a second
 * listener to the input port: the store owns the port's `onmidimessage`
 * handler, which is what implicitly opens the port.
 */
export function initializeSdsListener(): void {
  if (unsubscribeSysex) {
    unsubscribeSysex();
  }

  unsubscribeSysex = addSysexListener(handleSysexMessage);

  logger.info('SDS message listener initialized');
}

/**
 * Clean up SDS message listener
 */
export function cleanupSdsListener(): void {
  if (unsubscribeSysex) {
    unsubscribeSysex();
    unsubscribeSysex = null;
  }
}

/**
 * Send SDS message via MIDI output
 */
function sendSdsMessage(data: number[]): void {
  const { selectedOutput } = midiState;

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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
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
 * Send one data packet and wait for its ACK, retransmitting on timeout or NAK.
 *
 * The device re-ACKs a retransmission of the previous packet without rewriting
 * its data, so resending after a lost packet or a lost ACK is safe.
 */
async function deliverPacket(
  packet: number[],
  expectedPacketNum: number
): Promise<'ack' | 'cancel' | 'failed'> {
  sendSdsMessage(packet);
  let deadline = Date.now() + PACKET_RETRY_WINDOW;
  let responseTimeout = PACKET_TIMEOUT;

  while (Date.now() < deadline) {
    const response = await waitForResponse(responseTimeout, expectedPacketNum);
    responseTimeout = PACKET_TIMEOUT;

    switch (response.type) {
      case 'ack':
        if (response.packet === expectedPacketNum) {
          return 'ack';
        }
        // Stale ACK for an earlier packet we retransmitted; keep waiting.
        break;
      case 'nak':
        if (response.packet !== expectedPacketNum) {
          // Stale NAK for a duplicate of an earlier packet; keep waiting.
          break;
        }
        logger.debug(`Packet ${expectedPacketNum} NAK - retrying`);
        sendSdsMessage(packet);
        break;
      case 'wait':
        // Device is busy (e.g. flash housekeeping): hold off retransmission
        // and give it a long window for the follow-up response.
        logger.debug(`Packet ${expectedPacketNum} WAIT - device is busy`);
        responseTimeout = WAIT_RESPONSE_TIMEOUT;
        deadline = Date.now() + WAIT_RESPONSE_TIMEOUT;
        break;
      case 'cancel':
        return 'cancel';
      default: // timeout: the packet or its ACK was lost in transit
        logger.debug(`Packet ${expectedPacketNum} timeout - retransmitting`);
        sendSdsMessage(packet);
        break;
    }
  }

  return 'failed';
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
    // Step 1: Send Dump Header. Resending it is idempotent - the device
    // reopens the target file and resets its expected packet number - so a
    // lost header or lost ACK is simply retried before falling back to an
    // open-loop transfer.
    logger.debug('Sending dump header...');
    const header = createDumpHeader(sampleNumber, 16, sampleRate, pcmData.length);

    if (onProgress) {
      onProgress({ stage: 'header', percentage: 0, handshaking: false });
    }

    let headerResponse: SdsResponse = { type: 'timeout', packet: 0 };
    for (let attempt = 1; attempt <= HEADER_ATTEMPTS; attempt++) {
      sendSdsMessage(header);
      headerResponse = await waitForResponse(HEADER_TIMEOUT);

      if (headerResponse.type === 'ack') {
        break;
      }
      if (headerResponse.type === 'cancel') {
        throw new Error('Device cancelled transfer - storage may be full');
      }
      logger.debug(`Header ${headerResponse.type} (attempt ${attempt}/${HEADER_ATTEMPTS})`);
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

      if (handshaking) {
        const status = await deliverPacket(packet, packetNum & 0x7F);

        if (status === 'cancel') {
          throw new Error('Device cancelled transfer - storage may be full');
        }
        if (status !== 'ack') {
          throw new Error(
            `No response for packet ${packetNum & 0x7F} after ${PACKET_RETRY_WINDOW}ms`
          );
        }
      } else {
        // Non-handshaking mode (the device never ACKed the header): pace
        // packets open-loop so the receiver can keep up.
        sendSdsMessage(packet);
        await delay(OPEN_LOOP_PACKET_DELAY);
      }

      successfulPackets++;
      offset += 80; // Move to next 40 samples (80 bytes)
      packetNum++;

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
