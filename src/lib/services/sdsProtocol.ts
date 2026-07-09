/**
 * MIDI Sample Dump Standard (SDS) Protocol Implementation
 *
 * This service implements the MIDI SDS protocol for reliable sample transfer
 * to and from the Dato DRUM device. It handles:
 * - Dump header creation and parsing
 * - Data packet encoding/decoding with checksum validation
 * - ACK/NAK handshaking with timeout fallback
 * - Progress monitoring
 * - Dump Request (download) with incoming data packet reception
 * - Transfer lock to prevent concurrent uploads/downloads
 */

import { midiState } from '$lib/stores/midi.svelte';
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
const SDS_DUMP_REQUEST = 0x03;
const SDS_ACK = 0x7F;
const SDS_NAK = 0x7E;
const SDS_CANCEL = 0x7D;
const SDS_WAIT = 0x7C;

// Timeouts
const PACKET_TIMEOUT = 20;    // 20ms per packet as per SDS spec
const HEADER_TIMEOUT = 2000;  // 2 second timeout for dump header
const DOWNLOAD_MSG_TIMEOUT = 2000; // 2 second per-message timeout for downloads

// Response handling
interface SdsResponse {
  type: 'ack' | 'nak' | 'wait' | 'cancel' | 'timeout';
  packet: number;
}

// Incoming message for download (dump header or data packet from device)
interface SdsIncomingMessage {
  type: 'header' | 'data' | 'cancel' | 'nak' | 'timeout' | 'aborted';
  raw?: Uint8Array;
}

let pendingResponse: {
  resolve: (response: SdsResponse) => void;
  timer: number;
} | null = null;

// Pending incoming message resolver for download flow
let pendingIncoming: {
  resolve: (msg: SdsIncomingMessage) => void;
  timer: number;
} | null = null;

// Messages that arrive while no waitForIncoming() is armed (SDS packets can
// arrive back-to-back faster than the receive loop re-arms) are queued here
// so they are never dropped.
let incomingQueue: SdsIncomingMessage[] = [];

let messageHandler: ((this: MIDIInput, ev: MIDIMessageEvent) => any) | null = null;

// Transfer lock: prevents concurrent SDS uploads/downloads
let _activeTransfer: 'upload' | 'download' | null = null;

/**
 * Check whether an SDS transfer (upload or download) is currently active.
 */
export function isTransferActive(): boolean {
  return _activeTransfer !== null;
}

/**
 * Acquire the transfer lock. Throws if a transfer is already in progress.
 */
export function acquireTransferLock(direction: 'upload' | 'download'): void {
  if (_activeTransfer) {
    throw new Error(`Cannot start ${direction}: another SDS transfer is already active`);
  }
  _activeTransfer = direction;
  logger.info(`Transfer lock acquired (${direction})`);
}

/**
 * Release the transfer lock.
 */
export function releaseTransferLock(): void {
  _activeTransfer = null;
  logger.info('Transfer lock released');
}

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

    // Handle ACK/NAK/WAIT/CANCEL responses during upload handshaking
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

    // Handle incoming dump header/data/cancel during download
    if (_activeTransfer === 'download') {
      let incoming: SdsIncomingMessage | null = null;
      if (messageType === SDS_DUMP_HEADER) {
        incoming = { type: 'header', raw: new Uint8Array(message) };
      } else if (messageType === SDS_DATA_PACKET) {
        incoming = { type: 'data', raw: new Uint8Array(message) };
      } else if (messageType === SDS_CANCEL) {
        incoming = { type: 'cancel' };
      } else if (messageType === SDS_NAK) {
        incoming = { type: 'nak' };
      }

      if (incoming) {
        if (pendingIncoming) {
          clearTimeout(pendingIncoming.timer);
          const { resolve } = pendingIncoming;
          pendingIncoming = null;
          resolve(incoming);
        } else {
          // Receive loop is busy processing the previous message — queue it
          incomingQueue.push(incoming);
        }
      }
    }
  }
}

/**
 * Initialize SDS message listener
 */
export function initializeSdsListener(): void {
  const { selectedInput } = midiState;

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
  const { selectedInput } = midiState;

  if (selectedInput && messageHandler) {
    selectedInput.removeEventListener('midimessage', messageHandler);
    messageHandler = null;
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

  acquireTransferLock('upload');

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
  } finally {
    releaseTransferLock();
  }
}

// ── Download (Dump Request) ─────────────────────────────────────────────

/**
 * Progress callback for sample download
 */
export interface SdsDownloadProgress {
  stage: 'request' | 'header' | 'data' | 'complete';
  packet?: number;
  totalPackets?: number;
  percentage: number;
}

/**
 * Result of a successful sample download
 */
export interface SdsDownloadResult {
  /** Decoded signed 16-bit samples as Float32Array (range -1..1) */
  samples: Float32Array;
  sampleRate: number;
  /** Number of 16-bit words reported in the dump header */
  lengthWords: number;
}

/**
 * Wait for an incoming SDS message from the device (dump header or data
 * packet). Returns a queued message immediately if one arrived while the
 * receive loop was busy; resolves with 'aborted' when the signal fires.
 */
function waitForIncoming(timeout: number, abortSignal?: AbortSignal): Promise<SdsIncomingMessage> {
  const queued = incomingQueue.shift();
  if (queued) {
    return Promise.resolve(queued);
  }

  if (abortSignal?.aborted) {
    return Promise.resolve({ type: 'aborted' });
  }

  return new Promise((resolve) => {
    // Cancel any existing pending incoming
    if (pendingIncoming) {
      clearTimeout(pendingIncoming.timer);
      pendingIncoming.resolve({ type: 'timeout' });
    }

    const settle = (msg: SdsIncomingMessage) => {
      abortSignal?.removeEventListener('abort', onAbort);
      resolve(msg);
    };

    const onAbort = () => {
      if (pendingIncoming?.resolve === settle) {
        clearTimeout(pendingIncoming.timer);
        pendingIncoming = null;
      }
      settle({ type: 'aborted' });
    };

    const timer = window.setTimeout(() => {
      pendingIncoming = null;
      settle({ type: 'timeout' });
    }, timeout);

    pendingIncoming = { resolve: settle, timer };
    abortSignal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Send ACK for a received packet
 */
function sendAck(packetNum: number): void {
  sendSdsMessage([SDS_ACK, packetNum & 0x7F]);
}

/**
 * Send NAK for a received packet (request retransmission)
 */
function sendNak(packetNum: number): void {
  sendSdsMessage([SDS_NAK, packetNum & 0x7F]);
}

/**
 * Send CANCEL to abort a transfer
 */
export function sendCancel(): void {
  sendSdsMessage([SDS_CANCEL, 0x00]);
  logger.info('Sent SDS CANCEL');
}

/**
 * Decode a 21-bit value from 3 SDS 7-bit groups (LSB first)
 */
function decode21Bit(b0: number, b1: number, b2: number): number {
  return (b0 & 0x7F) | ((b1 & 0x7F) << 7) | ((b2 & 0x7F) << 14);
}

/**
 * Verify the checksum of an incoming SDS data packet.
 * Checksum = XOR of bytes at positions [1] through [data.length-3], masked & 0x7F.
 */
function verifyPacketChecksum(raw: Uint8Array): boolean {
  // raw layout: F0 7E 65 02 <pkt#> <120 data bytes> <checksum> F7
  // checksum covers bytes [1..length-3] (i.e. 7E, 65, 02, pkt#, and 120 data bytes)
  let xor = 0;
  for (let i = 1; i <= raw.length - 3; i++) {
    xor ^= raw[i];
  }
  xor &= 0x7F;
  const expected = raw[raw.length - 2];
  return xor === expected;
}

/**
 * Unpack a single 16-bit sample from 3 SDS bytes (left-justified)
 *
 * value = ((b0 & 0x7F) << 9) | ((b1 & 0x7F) << 2) | ((b2 & 0x7F) >> 5)
 * Then subtract 0x8000 to get signed 16-bit.
 */
function unpack16BitSample(b0: number, b1: number, b2: number): number {
  const unsigned = ((b0 & 0x7F) << 9) | ((b1 & 0x7F) << 2) | ((b2 & 0x7F) >> 5);
  return unsigned - 0x8000; // convert to signed
}

/**
 * Download a sample from the Dato DRUM via SDS Dump Request.
 *
 * Sends a Dump Request, receives the Dump Header and Data Packets,
 * and returns the decoded sample data.
 *
 * @param sampleNumber - Slot number (30-61)
 * @param onProgress - Progress callback
 * @param abortSignal - Optional AbortSignal to cancel the download
 * @returns The downloaded sample data, or null if the slot is empty
 */
export async function receiveSampleViaSds(
  sampleNumber: number,
  onProgress?: (progress: SdsDownloadProgress) => void,
  abortSignal?: AbortSignal
): Promise<SdsDownloadResult | null> {
  if (sampleNumber < 30 || sampleNumber > 61) {
    throw new Error(`Sample number must be between 30-61, got: ${sampleNumber}`);
  }

  acquireTransferLock('download');

  logger.info(`Starting SDS download: slot ${sampleNumber}`);

  incomingQueue = [];

  try {
    // Step 1: Send Dump Request
    // F0 7E 65 03 <slot LSB> <slot MSB> F7
    const slotLsb = sampleNumber & 0x7F;
    const slotMsb = (sampleNumber >> 7) & 0x7F;
    sendSdsMessage([SDS_DUMP_REQUEST, slotLsb, slotMsb]);

    onProgress?.({ stage: 'request', percentage: 0 });

    // Step 2: Wait for Dump Header (or CANCEL if slot is empty)
    const headerMsg = await waitForIncoming(DOWNLOAD_MSG_TIMEOUT, abortSignal);

    if (headerMsg.type === 'aborted') {
      sendCancel();
      throw new Error('Download aborted');
    }

    if (headerMsg.type === 'cancel') {
      logger.info(`Slot ${sampleNumber} is empty (device sent CANCEL)`);
      return null; // Slot is empty — not an error
    }

    if (headerMsg.type === 'timeout') {
      throw new Error('No response from device — firmware may not support SDS download');
    }

    if (headerMsg.type === 'nak') {
      throw new Error('Device rejected dump request');
    }

    if (headerMsg.type !== 'header' || !headerMsg.raw) {
      throw new Error(`Unexpected response type: ${headerMsg.type}`);
    }

    // Parse Dump Header
    // Layout: F0 7E 65 01 sl sh ee p1 p2 p3 g1 g2 g3 ... F7
    const hdr = headerMsg.raw;
    const bitDepth = hdr[6];
    const samplePeriodNs = decode21Bit(hdr[7], hdr[8], hdr[9]);
    const lengthWords = decode21Bit(hdr[10], hdr[11], hdr[12]);

    const sampleRate = samplePeriodNs > 0 ? Math.round(1000000000 / samplePeriodNs) : 44100;
    const totalBytes = lengthWords * 2;
    const totalPackets = Math.ceil(lengthWords / 40); // 40 samples per packet

    logger.info(`Dump header: ${bitDepth}-bit, ${sampleRate}Hz, ${lengthWords} words (${totalPackets} packets)`);

    onProgress?.({ stage: 'header', percentage: 0 });

    // ACK the header
    sendAck(0x00);

    // Step 3: Receive Data Packets
    const allSamples = new Int16Array(lengthWords);
    let samplesReceived = 0;
    let expectedPacketNum = 0;
    let lastAckedPacket = -1;

    while (samplesReceived < lengthWords) {
      const dataMsg = await waitForIncoming(DOWNLOAD_MSG_TIMEOUT, abortSignal);

      if (dataMsg.type === 'aborted') {
        sendCancel();
        throw new Error('Download aborted');
      }

      if (dataMsg.type === 'timeout') {
        throw new Error('Device stopped responding during download');
      }

      if (dataMsg.type === 'cancel') {
        throw new Error('Device cancelled download');
      }

      if (dataMsg.type !== 'data' || !dataMsg.raw) {
        throw new Error(`Unexpected message during download: ${dataMsg.type}`);
      }

      const raw = dataMsg.raw;
      const packetNum = raw[4] & 0x7F;

      // Verify checksum
      if (!verifyPacketChecksum(raw)) {
        logger.warn(`Packet ${packetNum} checksum failed — sending NAK`);
        sendNak(packetNum);
        continue;
      }

      // Handle duplicate packets (our previous ACK may have been lost)
      if (packetNum === lastAckedPacket) {
        logger.debug(`Duplicate packet ${packetNum} — re-ACKing`);
        sendAck(packetNum);
        continue;
      }

      // Reject out-of-order packets — writing them into the buffer at the
      // current offset would silently corrupt the sample
      if (packetNum !== expectedPacketNum) {
        logger.warn(`Out-of-order packet ${packetNum} (expected ${expectedPacketNum}) — sending NAK`);
        sendNak(expectedPacketNum);
        continue;
      }

      // Decode 40 samples from 120 data bytes (bytes [5..124])
      const dataStart = 5;
      for (let i = 0; i < 40 && samplesReceived < lengthWords; i++) {
        const b0 = raw[dataStart + i * 3];
        const b1 = raw[dataStart + i * 3 + 1];
        const b2 = raw[dataStart + i * 3 + 2];
        allSamples[samplesReceived] = unpack16BitSample(b0, b1, b2);
        samplesReceived++;
      }

      // ACK this packet
      sendAck(packetNum);
      lastAckedPacket = packetNum;
      expectedPacketNum = (packetNum + 1) & 0x7F;

      // Progress update
      const percentage = Math.min(100, (samplesReceived / lengthWords) * 100);
      onProgress?.({
        stage: 'data',
        packet: Math.ceil(samplesReceived / 40),
        totalPackets,
        percentage
      });
    }

    logger.info(`Download complete: ${samplesReceived} samples received`);

    // Convert Int16Array to Float32Array (normalized -1..1)
    const floatSamples = new Float32Array(lengthWords);
    for (let i = 0; i < lengthWords; i++) {
      floatSamples[i] = allSamples[i] / 32768;
    }

    onProgress?.({ stage: 'complete', percentage: 100 });

    return {
      samples: floatSamples,
      sampleRate,
      lengthWords
    };
  } catch (error) {
    logger.error('SDS download failed: ' + (error instanceof Error ? error.message : String(error)));
    throw error;
  } finally {
    incomingQueue = [];
    releaseTransferLock();
  }
}
