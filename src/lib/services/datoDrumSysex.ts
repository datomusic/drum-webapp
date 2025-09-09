import { get } from 'svelte/store';
import { midiStore } from '$lib/stores/midi';

const SYSEX_START = 0xF0;
const SYSEX_END = 0xF7;
// Dato manufacturer ID (00 22 01) and DRUM device ID (0x65)
const DATO_MANUFACTURER_ID = [0x00, 0x22, 0x01];
const DATO_DRUM_DEVICE_ID = 0x65;

// SysEx Command Tags for Sample Transfer
export const TAG_BEGIN_FILE_TRANSFER = 0x10;
export const TAG_FILE_CONTENT_CHUNK = 0x11;
export const TAG_END_FILE_TRANSFER = 0x12;

/**
 * Sends a SysEx message to the connected Dato DRUM.
 * @param tag The specific command tag for the Dato DRUM.
 * @param body The byte array for the message body.
 * @throws Error if no output is selected or if sending fails.
 */
export function sendDatoDrumSysEx(tag: number, body: number[]): void {
    const { selectedOutput } = get(midiStore);
    if (!selectedOutput) {
        console.error('No MIDI output selected. Cannot send Dato DRUM SysEx message.');
        throw new Error('No MIDI output selected.');
    }

    const message = [
        SYSEX_START,
        ...DATO_MANUFACTURER_ID,
        DATO_DRUM_DEVICE_ID,
        tag,
        ...body,
        SYSEX_END
    ];

    try {
        selectedOutput.send(message);
        // console.debug(`Sent Dato DRUM SysEx: Tag=${tag.toString(16)}, BodyLen=${body.length}`);
    } catch (e) {
        console.error(`Error sending Dato DRUM SysEx message: ${(e as Error).message}`);
        throw e;
    }
}
