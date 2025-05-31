import { sendDatoDrumSysEx, TAG_BEGIN_FILE_TRANSFER, TAG_FILE_CONTENT_CHUNK, TAG_END_FILE_TRANSFER } from './datoDrumSysex';

const TEXT_ENCODER = new TextEncoder();
const MAX_SYSEX_PAYLOAD_BYTES_PER_CHUNK = 100; // As per sample_sender.js (bytes.length >= 100)
const INTER_CHUNK_DELAY_MS = 5; // As per sample_sender.js

/**
 * Packs a 16-bit value into 3 SysEx-safe 7-bit bytes.
 */
function pack3_16(value: number): number[] {
    return [
        (value >> 14) & 0x7F,
        (value >> 7) & 0x7F,
        value & 0x7F
    ];
}

async function sleepMs(milliseconds: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
}

/**
 * Initiates a file transfer to the Dato DRUM.
 * @param fileName The name of the file to be transferred.
 */
export function beginFileTransfer(fileName: string): void {
    const encodedName = TEXT_ENCODER.encode(fileName);
    let packedBytes: number[] = [];

    for (let i = 0; i < encodedName.length; i += 2) {
        const lower = encodedName[i];
        const upper = (i + 1 < encodedName.length) ? encodedName[i + 1] : 0x00; // Pad with 0 if odd length for upper
        packedBytes = packedBytes.concat(pack3_16((upper << 8) + lower));
    }

    sendDatoDrumSysEx(TAG_BEGIN_FILE_TRANSFER, packedBytes);
    // console.log(`Begin file transfer: ${fileName}`);
}

/**
 * Sends chunks of file content to the Dato DRUM.
 * @param data The raw byte data of the file content (e.g., processed WAV data).
 * @param onProgress Optional callback for progress updates (e.g., percentage).
 */
export async function sendFileContent(data: Uint8Array, onProgress?: (progress: number) => void): Promise<void> {
    // console.log(`Sending file content, length: ${data.length}`);
    let packedBytes: number[] = [];
    let totalBytesSent = 0;

    for (let i = 0; i < data.length; i += 2) {
        const lower = data[i];
        const upper = (i + 1 < data.length) ? data[i + 1] : 0x00; // Pad with 0 if odd length
        packedBytes = packedBytes.concat(pack3_16((upper << 8) + lower));

        if (packedBytes.length >= MAX_SYSEX_PAYLOAD_BYTES_PER_CHUNK) {
            sendDatoDrumSysEx(TAG_FILE_CONTENT_CHUNK, packedBytes);
            // console.log(`Sent chunk, ${packedBytes.length} packed bytes`);
            packedBytes = [];
            await sleepMs(INTER_CHUNK_DELAY_MS);
        }
        totalBytesSent = i + (i + 1 < data.length ? 2 : 1);
        if (onProgress) {
            onProgress(Math.round((totalBytesSent / data.length) * 100));
        }
    }

    if (packedBytes.length > 0) {
        sendDatoDrumSysEx(TAG_FILE_CONTENT_CHUNK, packedBytes);
        // console.log(`Sent final chunk, ${packedBytes.length} packed bytes`);
    }

    if (data.length % 2 !== 0 && data.length > 0) {
        // console.warn("Note: If original data length was odd, the last byte was packed with a 0x00 for the upper byte.");
    }
    if (onProgress) onProgress(100); // Ensure progress reaches 100%
    await sleepMs(100); // Final delay as in sample_sender.js
}

/**
 * Finalizes the file transfer to the Dato DRUM.
 */
export function endFileTransfer(): void {
    sendDatoDrumSysEx(TAG_END_FILE_TRANSFER, []);
    // console.log("End file transfer signaled.");
}

/**
 * Orchestrates the full sample transfer process.
 * @param fileName The desired filename on the device.
 * @param sampleData The processed sample data (44.1kHz, 16-bit, mono, 1s max).
 * @param onProgress Optional callback for progress updates.
 */
export async function transferSample(
    fileName: string,
    sampleData: Uint8Array,
    onProgress?: (progress: { stage: 'begin' | 'content' | 'end'; percentage: number }) => void
): Promise<void> {
    try {
        if (onProgress) onProgress({ stage: 'begin', percentage: 0 });
        beginFileTransfer(fileName);
        if (onProgress) onProgress({ stage: 'begin', percentage: 100 });

        if (onProgress) onProgress({ stage: 'content', percentage: 0 });
        await sendFileContent(sampleData, (p) => {
            if (onProgress) onProgress({ stage: 'content', percentage: p });
        });
        // sendFileContent calls onProgress(100) internally

        if (onProgress) onProgress({ stage: 'end', percentage: 0 });
        endFileTransfer();
        if (onProgress) onProgress({ stage: 'end', percentage: 100 });
    } catch (error) {
        console.error("Sample transfer failed:", error);
        throw error; // Re-throw for UI to handle
    }
}
