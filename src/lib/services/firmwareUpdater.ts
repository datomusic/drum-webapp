// src/lib/services/firmwareUpdater.ts
//
// Streams a UF2 firmware image to the DRUM over MIDI SysEx using the
// Begin/Bytes/End/Abort commands (0x20-0x23). The device writes the image to
// the inactive A/B partition, verifies the SHA-256, then reboots into the new
// firmware for a trial boot. Mirrors the `flash` command in drumtool.js.

import { sendDatoDrumSysEx } from './datoDrumSysex';
import { addSysexListener } from '$lib/stores/midi.svelte';
import { createLogger } from '$lib/utils/logger';

const logger = createLogger('FirmwareUpdater');

const SYSEX_START = 0xF0;
const SYSEX_END = 0xF7;
const DATO_MANUFACTURER_ID = [0x00, 0x22, 0x01];
const DATO_DRUM_DEVICE_ID = 0x65;

// Firmware update command tags (custom Dato protocol)
const BEGIN_FIRMWARE_UPDATE = 0x20;
const FIRMWARE_BYTES = 0x21;
const END_FIRMWARE_UPDATE = 0x22;
const ABORT_FIRMWARE_UPDATE = 0x23;
const CUSTOM_ACK = 0x13;
const CUSTOM_NACK = 0x14;

// Decoded bytes per FirmwareBytes message; must be a multiple of 7 so each
// message contains whole 8-byte encoded groups.
const FIRMWARE_CHUNK_SIZE = 7 * 146; // 1022 bytes
const FIRMWARE_ACK_TIMEOUT_MS = 5000;

const UF2_MAGIC_START_0 = 0x0A324655;
const UF2_BLOCK_SIZE = 512;

export interface FirmwareUploadProgress {
    sentBytes: number;
    totalBytes: number;
}

// Packs 8-bit data into SysEx-safe 8-byte groups: 7 data bytes (low 7 bits)
// followed by one byte carrying the MSBs. Mirrors codec::decode_8_to_7 in the
// firmware. The final group is zero-padded; the device ignores the padding.
function encode8to7(data: Uint8Array): number[] {
    const out: number[] = [];
    for (let i = 0; i < data.length; i += 7) {
        let msbs = 0;
        for (let j = 0; j < 7; j++) {
            const byte = i + j < data.length ? data[i + j] : 0;
            out.push(byte & 0x7F);
            msbs |= ((byte >> 7) & 0x01) << j;
        }
        out.push(msbs);
    }
    return out;
}

// Encodes raw bytes as 16-bit values, 3 SysEx bytes per value (matches
// codec::decode_3_to_16bit in the firmware). Used for the Begin payload.
function encode3to16(bytes: number[]): number[] {
    const out: number[] = [];
    for (let i = 0; i < bytes.length; i += 2) {
        const value = bytes[i] | ((i + 1 < bytes.length ? bytes[i + 1] : 0) << 8);
        out.push((value >> 14) & 0x7F, (value >> 7) & 0x7F, value & 0x7F);
    }
    return out;
}

export function validateUf2(data: Uint8Array): void {
    if (data.length === 0 || data.length % UF2_BLOCK_SIZE !== 0) {
        throw new Error('Firmware file is not a UF2 file (size not a multiple of 512).');
    }
    const magic = new DataView(data.buffer, data.byteOffset, 4).getUint32(0, true);
    if (magic !== UF2_MAGIC_START_0) {
        throw new Error('Firmware file is not a UF2 file (bad magic).');
    }
}

function isCustomDatoMessage(data: Uint8Array): boolean {
    return (
        data.length >= 7 &&
        data[0] === SYSEX_START &&
        data[data.length - 1] === SYSEX_END &&
        data[1] === DATO_MANUFACTURER_ID[0] &&
        data[2] === DATO_MANUFACTURER_ID[1] &&
        data[3] === DATO_MANUFACTURER_ID[2] &&
        data[4] === DATO_DRUM_DEVICE_ID
    );
}

/**
 * Streams a validated UF2 image to the connected DRUM over SysEx.
 * Resolves once the device has verified the image (final ACK after End);
 * the device then reboots into the new firmware on its own.
 */
export async function uploadFirmware(
    uf2: Uint8Array,
    onProgress?: (progress: FirmwareUploadProgress) => void
): Promise<void> {
    validateUf2(uf2);

    const sha256 = new Uint8Array(await crypto.subtle.digest('SHA-256', uf2 as BufferSource));
    logger.info(`Starting firmware upload: ${uf2.length} bytes (${uf2.length / UF2_BLOCK_SIZE} UF2 blocks)`);

    interface AckWaiter {
        resolve: () => void;
        reject: (error: Error) => void;
        timer: ReturnType<typeof setTimeout>;
    }
    const ackQueue: AckWaiter[] = [];

    const unsubscribe = addSysexListener((data) => {
        if (!isCustomDatoMessage(data)) return;
        const tag = data[5];
        if (tag !== CUSTOM_ACK && tag !== CUSTOM_NACK) return;
        const waiter = ackQueue.shift();
        if (!waiter) return;
        clearTimeout(waiter.timer);
        if (tag === CUSTOM_ACK) {
            waiter.resolve();
        } else {
            waiter.reject(new Error('Device rejected the firmware update (NACK).'));
        }
    });

    function waitForAck(timeout = FIRMWARE_ACK_TIMEOUT_MS): Promise<void> {
        return new Promise((resolve, reject) => {
            const waiter: AckWaiter = {
                resolve,
                reject,
                timer: setTimeout(() => {
                    const index = ackQueue.indexOf(waiter);
                    if (index > -1) ackQueue.splice(index, 1);
                    reject(new Error(`Timed out waiting for device response after ${timeout}ms.`));
                }, timeout),
            };
            ackQueue.push(waiter);
        });
    }

    try {
        // Begin: total size (32-bit LE) + SHA-256 + version placeholder (the
        // device treats the version as informational).
        const beginPayload = [
            uf2.length & 0xFF,
            (uf2.length >> 8) & 0xFF,
            (uf2.length >> 16) & 0xFF,
            (uf2.length >> 24) & 0xFF,
            ...sha256,
            0, 0, 0,
        ];
        sendDatoDrumSysEx(BEGIN_FIRMWARE_UPDATE, encode3to16(beginPayload));
        await waitForAck();
        logger.info('Device accepted firmware update, streaming...');

        try {
            for (let offset = 0; offset < uf2.length; offset += FIRMWARE_CHUNK_SIZE) {
                const chunk = uf2.subarray(offset, Math.min(offset + FIRMWARE_CHUNK_SIZE, uf2.length));
                sendDatoDrumSysEx(FIRMWARE_BYTES, encode8to7(chunk));
                await waitForAck();
                onProgress?.({
                    sentBytes: Math.min(offset + FIRMWARE_CHUNK_SIZE, uf2.length),
                    totalBytes: uf2.length,
                });
            }
        } catch (error) {
            try {
                sendDatoDrumSysEx(ABORT_FIRMWARE_UPDATE, []);
            } catch {
                // Sending the abort is best-effort; the original error matters more
            }
            throw error;
        }

        sendDatoDrumSysEx(END_FIRMWARE_UPDATE, []);
        await waitForAck();
        logger.info('Firmware verified by device; it will reboot into the new firmware.');
    } finally {
        unsubscribe();
        for (const waiter of ackQueue) {
            clearTimeout(waiter.timer);
        }
        ackQueue.length = 0;
    }
}

/**
 * Downloads the given firmware UF2 into memory. The firmware is bundled with
 * the webapp at build time and served same-origin (GitHub's release-asset CDN
 * sends no CORS headers, so it cannot be fetched from the browser directly).
 */
export async function downloadFirmwareBinary(firmware: { downloadUrl: string }): Promise<Uint8Array> {
    const response = await fetch(firmware.downloadUrl);
    if (!response.ok) {
        throw new Error(`Firmware download failed with status ${response.status}`);
    }
    return new Uint8Array(await response.arrayBuffer());
}
