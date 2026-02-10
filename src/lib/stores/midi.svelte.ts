'use runes';

import { getCurrentFirmwareVersion } from '$lib/config/firmware';
import { createLogger, isMidiRealtimeMessage, isMidiSystemMessage } from '$lib/utils/logger';

interface MidiState {
    access: MIDIAccess | null;
    inputs: MIDIInputMap | null;
    outputs: MIDIOutputMap | null;
    selectedInput: MIDIInput | null;
    selectedOutput: MIDIOutput | null;
    isConnected: boolean;
    error: string | null;
    isRequestingAccess: boolean;
    firmwareVersion: string | null;
    ignoreFirmwareUpdate: boolean;
}

const initialState: MidiState = {
    access: null,
    inputs: null,
    outputs: null,
    selectedInput: null,
    selectedOutput: null,
    isConnected: false,
    error: null,
    isRequestingAccess: false,
    firmwareVersion: null,
    ignoreFirmwareUpdate: false,
};

const SYSEX_START = 0xF0;
const SYSEX_END = 0xF7;

// Dato DRUM manufacturer-specific SysEx header
// Based on custom protocol: manufacturer ID 00 22 01, device ID 0x65
const DATO_MANUFACTURER_ID: number[] = [0x00, 0x22, 0x01];
const DATO_DRUM_DEVICE_ID = 0x65;
const SYSEX_UNIVERSAL_NONREALTIME_ID = 0x7E;
const SYSEX_ALL_ID = 0x7F;
const SYSEX_REBOOT_BOOTLOADER = 0x0B;

const SYSEX_GENERAL_INFO = 0x06;
const SYSEX_IDENTITY_REQUEST = 0x01;
const SYSEX_IDENTITY_REPLY = 0x02;

const MIDI_STATUS_MASK = 0xF0;
const MIDI_NOTE_ON = 0x90;
const MIDI_NOTE_OFF = 0x80;
const MIDI_NOTE_ON_CHANNEL1 = 0x99;
const MIDI_NOTE_OFF_CHANNEL1 = 0x89;

const DRUM_DEVICE_FILTERS = ['DRUM', 'Dato DRUM', 'Pico'];
const DRUM_DEVICE_FILTERS_LOWER = DRUM_DEVICE_FILTERS.map((f) => f.toLowerCase());

const NOTE_ON_VELOCITY = 127;
const NOTE_OFF_VELOCITY = 0;
const NOTE_DURATION_MS = 100;

const logger = createLogger('MIDI');

let midiState = $state<MidiState>(initialState);
interface MidiNoteState {
    active: number | null;
    selectedSample: number | null;
    triggerId: number;
    lastTriggeredNote: number | null;
}

const midiNoteState = $state<MidiNoteState>({
    active: null,
    selectedSample: null,
    triggerId: 0,
    lastTriggeredNote: null,
});

function parseFirmwareVersionReply(data: Uint8Array): string | null {
    logger.debug('Received SysEx message for parsing: ' + Array.from(data).map((b) => b.toString(16).padStart(2, '0')).join(' '), 'sysex');
    logger.debug('Message length: ' + data.length, 'sysex');

    // Check for custom Dato protocol firmware version response
    // Expected format: F0 00 22 01 65 01 <major> <minor> <patch> F7
    const REQUEST_FIRMWARE_VERSION = 0x01;

    if (
        data.length >= 9 &&
        data[0] === SYSEX_START &&
        data[1] === DATO_MANUFACTURER_ID[0] && // 0x00
        data[2] === DATO_MANUFACTURER_ID[1] && // 0x22
        data[3] === DATO_MANUFACTURER_ID[2] && // 0x01
        data[4] === DATO_DRUM_DEVICE_ID && // 0x65
        data[5] === REQUEST_FIRMWARE_VERSION && // 0x01
        data[data.length - 1] === SYSEX_END
    ) {
        const major = data[6];
        const minor = data[7];
        const patch = data[8];

        logger.debug('Parsed version components (custom protocol): ' + JSON.stringify({ major, minor, patch }), 'firmware');

        const fwVersion = `${major}.${minor}.${patch}`;
        logger.info(`Identified device firmware: ${fwVersion}`, 'firmware');
        return fwVersion;
    }

    // Fallback: Try to parse as standard MIDI Identity Reply (for backwards compatibility)
    const SYSEX_EXTRA_BYTE = 0x00;
    const hasExtraByte = data[1] === SYSEX_EXTRA_BYTE;
    const offset = hasExtraByte ? 1 : 0;

    if (
        data.length > 13 + offset &&
        data[1 + offset] === SYSEX_UNIVERSAL_NONREALTIME_ID &&
        data[3 + offset] === SYSEX_GENERAL_INFO &&
        data[4 + offset] === SYSEX_IDENTITY_REPLY
    ) {
        const major = data[10 + offset];
        const minor = data[11 + offset];
        const patch = data[12 + offset];
        const commits = data[13 + offset]; // Dato-specific: number of commits

        logger.debug('Parsed version components (standard MIDI): ' + JSON.stringify({ major, minor, patch, commits }), 'firmware');

        const fwVersion = commits === 0 ? `${major}.${minor}.${patch}` : `${major}.${minor}.${patch}-dev.${commits}`;

        logger.info(`Identified device firmware: ${fwVersion}`, 'firmware');
        return fwVersion;
    }

    logger.warn('SysEx message is not a recognized firmware version response.', 'sysex');
    logger.debug('Expected custom protocol: F0 00 22 01 65 01 <major> <minor> <patch> F7', 'sysex');
    logger.debug('Or standard MIDI Identity Reply', 'sysex');
    return null;
}

function handleMidiNoteMessage(data: Uint8Array): void {
    const [statusCode, noteNumber, velocity] = data;
    const status = statusCode & MIDI_STATUS_MASK;

    if (status === MIDI_NOTE_ON && velocity > 0) {
        midiNoteState.active = noteNumber;
        midiNoteState.selectedSample = noteNumber;
        midiNoteState.triggerId++;
        midiNoteState.lastTriggeredNote = noteNumber;
    } else if (status === MIDI_NOTE_OFF || (status === MIDI_NOTE_ON && velocity === 0)) {
        midiNoteState.active = null;
    }
}

// --- Start of Internal State Update Actions ---

function _setIsRequestingAccess(isRequesting: boolean) {
    midiState.isRequestingAccess = isRequesting;
    if (isRequesting) {
        midiState.error = null;
    }
}

function _setMidiAccessGranted(midiAccess: MIDIAccess) {
    midiState.access = midiAccess;
    midiState.inputs = midiAccess.inputs;
    midiState.outputs = midiAccess.outputs;
    midiState.error = null;
}

function _setMidiAccessFailed(errorMessage: string) {
    midiState.access = null;
    midiState.inputs = null;
    midiState.outputs = null;
    midiState.selectedOutput = null;
    midiState.selectedInput = null;
    midiState.isConnected = false;
    midiState.firmwareVersion = null;
    midiState.error = errorMessage;
}

function _setDeviceConnected(output: MIDIOutput, input: MIDIInput | null) {
    midiState.selectedOutput = output;
    midiState.selectedInput = input;
    midiState.isConnected = true;
    midiState.firmwareVersion = null; // Reset firmware version, expect new SysEx reply
    midiState.error = null;
}

function _setDeviceDisconnected() {
    midiState.selectedOutput = null;
    midiState.selectedInput = null;
    midiState.isConnected = false;
    midiState.firmwareVersion = null;
    midiState.error = null;
}

function _setDeviceConnectionError(errorMessage: string) {
    midiState.selectedOutput = null;
    midiState.selectedInput = null;
    midiState.isConnected = false;
    midiState.firmwareVersion = null;
    midiState.error = errorMessage;
}

function _setFirmwareVersion(fwVersion: string | null) {
    midiState.firmwareVersion = fwVersion;
}

function _setIgnoreFirmwareUpdate(ignore: boolean) {
    midiState.ignoreFirmwareUpdate = ignore;
}

function _updateAvailableMidiDevices(midiAccess: MIDIAccess) {
    midiState.access = midiAccess;
    midiState.inputs = midiAccess.inputs;
    midiState.outputs = midiAccess.outputs;
}

// --- End of Internal State Update Actions ---

async function requestMidiAccess() {
    _setIsRequestingAccess(true);
    try {
        if (!navigator.requestMIDIAccess) {
            throw new Error('Web MIDI API is not supported in this browser.');
        }

        const midiAccess = await navigator.requestMIDIAccess({ sysex: true });
        _setMidiAccessGranted(midiAccess);

        midiAccess.onstatechange = (event) => {
            if (event.port) {
                logger.debug('MIDI state change: ' + event.port.name + ', ' + event.port.state);
                _updateAvailableMidiDevices(midiAccess);
                if (event.port.state === 'disconnected' && midiState.selectedOutput?.id === event.port.id) {
                    disconnectDevice();
                }
            }
        };
        logger.info('MIDI access granted');
    } catch (err: unknown) {
        logger.error('Failed to get MIDI access: ' + (err instanceof Error ? err.message : String(err)));
        let errorMessage = 'Failed to get MIDI access. Please ensure your device is connected and browser permissions are granted.';
        if (err instanceof Error) {
            errorMessage = err.message;
        }
        _setMidiAccessFailed(errorMessage);
    } finally {
        _setIsRequestingAccess(false);
    }
}

function connectDevice(deviceId: string) {
    const currentOutputs = midiState.outputs;
    const currentInputs = midiState.inputs;

    if (currentOutputs && currentInputs) {
        const output = currentOutputs.get(deviceId);
        let input: MIDIInput | undefined;

        if (output) {
            input = Array.from(currentInputs.values()).find((inputPort) => inputPort.name === output.name);

            if (!input) {
                input = Array.from(currentInputs.values()).find((inputPort) => {
                    const inputNameLower = inputPort.name?.toLowerCase();
                    return inputNameLower && DRUM_DEVICE_FILTERS_LOWER.some((filter) => inputNameLower.includes(filter));
                });
            }

            if (input) {
                input.onmidimessage = (event) => {
                    const data = event.data;
                    if (!data) {
                        logger.warn('Received MIDI message with no data');
                        return;
                    }

                    const statusByte = data[0];

                    // Filter out realtime messages (they're very frequent and noisy)
                    if (isMidiRealtimeMessage(statusByte)) {
                        logger.debug(`MIDI realtime message: ${statusByte.toString(16)}`, 'realtime');
                        return;
                    }

                    // Log other messages with appropriate filtering
                    if (isMidiSystemMessage(statusByte)) {
                        logger.debug('MIDI system message: ' + Array.from(data).map((b) => b.toString(16).padStart(2, '0')).join(' '), 'midi');
                    } else {
                        logger.debug('MIDI message: ' + Array.from(data).map((b) => b.toString(16).padStart(2, '0')).join(' '), 'midi');
                    }

                    if (data[0] === SYSEX_START) {
                        logger.debug('Detected SysEx message, parsing...', 'sysex');
                        const fwVersion = parseFirmwareVersionReply(data);
                        if (fwVersion) {
                            logger.info('Successfully parsed firmware version: ' + fwVersion, 'firmware');
                            _setFirmwareVersion(fwVersion);
                        } else {
                            logger.debug('Failed to parse firmware version from SysEx', 'sysex');
                        }
                    } else {
                        logger.debug('Regular MIDI message, handling as note...', 'midi');
                        handleMidiNoteMessage(data);
                    }
                };
                logger.info('Listening to MIDI input: ' + input.name);
            } else {
                logger.warn('No matching MIDI input found for selected output device.');
            }
            _setDeviceConnected(output, input || null);
            logger.info('Connected to MIDI device: ' + output.name);
        } else {
            _setDeviceConnectionError('Selected device not found.');
            logger.error('Device not found: ' + deviceId);
        }
    } else {
        _setDeviceConnectionError('MIDI outputs/inputs not available. Please request MIDI access first.');
        logger.error('MIDI outputs/inputs not available.');
    }
}

function disconnectDevice() {
    if (midiState.selectedInput) {
        midiState.selectedInput.onmidimessage = null;
    }
    _setDeviceDisconnected();
    midiNoteState.active = null;
    midiNoteState.selectedSample = null;
    logger.info('Disconnected from MIDI device.');
}

function requestIdentity() {
    const { selectedOutput } = midiState;
    if (!selectedOutput) {
        logger.warn('No MIDI output selected. Cannot request identity.');
        return;
    }

    // Use the same custom protocol as drumtool.js
    const REQUEST_FIRMWARE_VERSION = 0x01;
    const message = [
        SYSEX_START,
        ...DATO_MANUFACTURER_ID, // [0x00, 0x22, 0x01]
        DATO_DRUM_DEVICE_ID, // 0x65
        REQUEST_FIRMWARE_VERSION, // 0x01
        SYSEX_END,
    ];

    selectedOutput.send(message);
    logger.info('Sent Firmware Version Request: ' + Array.from(message).map((b) => b.toString(16).padStart(2, '0')).join(' '), 'sysex');
}

function rebootToBootloader() {
    const { selectedOutput } = midiState;
    if (!selectedOutput) {
        logger.warn('No MIDI output selected. Cannot send reboot command.');
        return;
    }

    // Use Dato manufacturer SysEx header (00 22 01) and DRUM device ID (0x65)
    const message = [
        SYSEX_START,
        ...DATO_MANUFACTURER_ID,
        DATO_DRUM_DEVICE_ID,
        SYSEX_REBOOT_BOOTLOADER,
        SYSEX_END,
    ];

    selectedOutput.send(message);
    logger.info('Sent SysEx Reboot to Bootloader command: ' + Array.from(message).map((b) => b.toString(16).padStart(2, '0')).join(' '), 'sysex');
}

function playNote(noteNumber: number) {
    const { selectedOutput } = midiState;

    if (selectedOutput) {
        selectedOutput.send([MIDI_NOTE_ON_CHANNEL1, noteNumber, NOTE_ON_VELOCITY]);

        midiNoteState.active = noteNumber;
        midiNoteState.selectedSample = noteNumber;
        midiNoteState.triggerId++;
        midiNoteState.lastTriggeredNote = noteNumber;

        setTimeout(() => {
            selectedOutput.send([MIDI_NOTE_OFF_CHANNEL1, noteNumber, NOTE_OFF_VELOCITY]);
            if (midiNoteState.active === noteNumber) {
                midiNoteState.active = null;
            }
        }, NOTE_DURATION_MS);
    } else {
        logger.warn('No MIDI output selected. Cannot play note.');
    }
}

function ignoreFirmwareUpdate() {
    _setIgnoreFirmwareUpdate(true);
}

export {
    midiState,
    midiNoteState,
    requestMidiAccess,
    connectDevice,
    disconnectDevice,
    playNote,
    requestIdentity,
    rebootToBootloader,
    ignoreFirmwareUpdate,
};
