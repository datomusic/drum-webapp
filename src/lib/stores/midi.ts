import { writable, get } from 'svelte/store';

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
};

const SYSEX_START = 0xF0;
const SYSEX_END = 0xF7;

const SYSEX_DATO_ID = 0x7D;
const SYSEX_DRUM_ID = 0x65;
const SYSEX_UNIVERSAL_NONREALTIME_ID = 0x7E;
const SYSEX_ALL_ID = 0x7F;
const SYSEX_REBOOT_BOOTLOADER = 0x0B;

const SYSEX_GENERAL_INFO = 0x06;
const SYSEX_IDENTITY_REQUEST = 0x01;
const SYSEX_IDENTITY_REPLY = 0x02;

const MIDI_STATUS_MASK = 0xF0;
const MIDI_NOTE_ON = 0x90;
const MIDI_NOTE_OFF = 0x80;
const MIDI_NOTE_ON_CHANNEL1 = 0x90;
const MIDI_NOTE_OFF_CHANNEL1 = 0x80;

const DRUM_DEVICE_FILTERS = ['DRUM', 'Dato DRUM', 'Pico'];
const DRUM_DEVICE_FILTERS_LOWER = DRUM_DEVICE_FILTERS.map(f => f.toLowerCase());

const NOTE_ON_VELOCITY = 127;
const NOTE_OFF_VELOCITY = 0;
const NOTE_DURATION_MS = 100;

function parseSysExIdentityReply(data: Uint8Array): string | null {
    console.log('Received SysEx message for parsing:', Array.from(data).map(b => b.toString(16).padStart(2, '0')).join(' '));

    const SYSEX_EXTRA_BYTE = 0x00;

    const hasExtraByte = data[1] === SYSEX_EXTRA_BYTE;
    const offset = hasExtraByte ? 1 : 0;

    // Expected structure: F0 7E <device_id> 06 02 ... F7
    // Firmware version starts at data[10+offset] for Dato DRUM
    if (data.length > 13 + offset &&
        data[1 + offset] === SYSEX_UNIVERSAL_NONREALTIME_ID &&
        data[3 + offset] === SYSEX_GENERAL_INFO &&
        data[4 + offset] === SYSEX_IDENTITY_REPLY) {

        const major = data[10 + offset];
        const minor = data[11 + offset];
        const patch = data[12 + offset];
        const commits = data[13 + offset]; // Dato-specific: number of commits

        const fwVersion = `${major}.${minor}.${patch}-dev.${commits}`;
        console.log(`Identified device firmware: ${fwVersion}`);
        return fwVersion;
    } else {
        console.log('SysEx message is not a recognized Identity Reply or is malformed.');
        return null;
    }
}

function handleMidiNoteMessage(data: Uint8Array): void {
    const [statusCode, noteNumber, velocity] = data;
    const status = statusCode & MIDI_STATUS_MASK;

    if (status === MIDI_NOTE_ON && velocity > 0) {
        activeMidiNote.set(noteNumber);
        selectedSampleMidiNote.set(noteNumber);
    } else if (status === MIDI_NOTE_OFF || (status === MIDI_NOTE_ON && velocity === 0)) {
        activeMidiNote.set(null);
    }
}

const { subscribe, set, update } = writable<MidiState>(initialState);

// --- Start of Internal State Update Actions ---

function _setIsRequestingAccess(isRequesting: boolean) {
    update(state => ({
        ...state,
        isRequestingAccess: isRequesting,
        error: isRequesting ? null : state.error,
    }));
}

function _setMidiAccessGranted(midiAccess: MIDIAccess) {
    update(state => ({
        ...state,
        access: midiAccess,
        inputs: midiAccess.inputs,
        outputs: midiAccess.outputs,
        error: null,
    }));
}

function _setMidiAccessFailed(errorMessage: string) {
    update(state => ({
        ...state,
        access: null,
        inputs: null,
        outputs: null,
        selectedOutput: null,
        selectedInput: null,
        isConnected: false,
        firmwareVersion: null,
        error: errorMessage,
    }));
}

function _setDeviceConnected(output: MIDIOutput, input: MIDIInput | null) {
    update(state => ({
        ...state,
        selectedOutput: output,
        selectedInput: input,
        isConnected: true,
        firmwareVersion: null, // Reset firmware version, expect new SysEx reply
        error: null,
    }));
}

function _setDeviceDisconnected() {
    update(state => ({
        ...state,
        selectedOutput: null,
        selectedInput: null,
        isConnected: false,
        firmwareVersion: null,
        error: null,
    }));
}

function _setDeviceConnectionError(errorMessage: string) {
    update(state => ({
        ...state,
        selectedOutput: null,
        selectedInput: null,
        isConnected: false,
        firmwareVersion: null,
        error: errorMessage,
    }));
}

function _setFirmwareVersion(fwVersion: string | null) {
    update(state => ({
        ...state,
        firmwareVersion: fwVersion, // Update firmware, don't touch other state like error
    }));
}

// Action to update the list of available MIDI devices, typically on state change
function _updateAvailableMidiDevices(midiAccess: MIDIAccess) {
    update(state => ({
        ...state,
        access: midiAccess, // Keep access object updated
        inputs: midiAccess.inputs,
        outputs: midiAccess.outputs,
        // Do not modify 'error' here, as a connection might be active/failed
        // while the device list is merely refreshing.
    }));
}

// --- End of Internal State Update Actions ---

export const activeMidiNote = writable<number | null>(null);
export const selectedSampleMidiNote = writable<number | null>(null);

async function requestMidiAccess() {
    _setIsRequestingAccess(true);
    try {
        if (!navigator.requestMIDIAccess) {
            throw new Error('Web MIDI API is not supported in this browser.');
        }

        const midiAccess = await navigator.requestMIDIAccess({ sysex: true });
        _setMidiAccessGranted(midiAccess);

        midiAccess.onstatechange = (event) => {
            console.log('MIDI state change:', event.port.name, event.port.state);
            _updateAvailableMidiDevices(midiAccess);
            if (event.port.state === 'disconnected' && get(midiStore).selectedOutput?.id === event.port.id) {
                disconnectDevice();
            }
        };
        console.log('MIDI access granted:', midiAccess);
    } catch (err: unknown) {
        console.error('Failed to get MIDI access:', err);
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
    const currentMidiState = get(midiStore);
    const currentOutputs = currentMidiState.outputs;
    const currentInputs = currentMidiState.inputs;

    if (currentOutputs && currentInputs) {
        const output = currentOutputs.get(deviceId);
        let input: MIDIInput | undefined;

        if (output) {
            input = Array.from(currentInputs.values()).find(inputPort => inputPort.name === output.name);

            if (!input) {
                input = Array.from(currentInputs.values()).find(inputPort => {
                    const inputNameLower = inputPort.name?.toLowerCase();
                    return inputNameLower && DRUM_DEVICE_FILTERS_LOWER.some(filter => inputNameLower.includes(filter));
                });
            }

            if (input) {
                input.onmidimessage = (event) => {
                    const data = event.data;
                    console.log('Incoming MIDI message:', data);

                    if (data[0] === SYSEX_START) {
                        const fwVersion = parseSysExIdentityReply(data);
                        if (fwVersion) {
                            _setFirmwareVersion(fwVersion);
                        }
                    } else {
                        handleMidiNoteMessage(data);
                    }
                };
                console.log('Listening to MIDI input:', input.name);
            } else {
                console.warn('No matching MIDI input found for selected output device.');
            }
            _setDeviceConnected(output, input || null);
            console.log('Connected to MIDI device:', output.name);
        } else {
            _setDeviceConnectionError('Selected device not found.');
            console.error('Device not found:', deviceId);
        }
    } else {
        _setDeviceConnectionError('MIDI outputs/inputs not available. Please request MIDI access first.');
        console.error('MIDI outputs/inputs not available.');
    }
}

function disconnectDevice() {
    const currentMidiState = get(midiStore);
    if (currentMidiState.selectedInput) {
        currentMidiState.selectedInput.onmidimessage = null;
    }
    _setDeviceDisconnected();
    activeMidiNote.set(null);
    selectedSampleMidiNote.set(null);
    console.log('Disconnected from MIDI device.');
}

function requestIdentity() {
    const { selectedOutput } = get(midiStore);
    if (!selectedOutput) {
        console.warn('No MIDI output selected. Cannot request identity.');
        return;
    }

    const message = [
        SYSEX_START,
        SYSEX_UNIVERSAL_NONREALTIME_ID,
        SYSEX_ALL_ID,
        SYSEX_GENERAL_INFO,
        SYSEX_IDENTITY_REQUEST,
        SYSEX_END
    ];

    selectedOutput.send(message);
    console.log('Sent SysEx Identity Request:', message);
}

function rebootToBootloader() {
    const { selectedOutput } = get(midiStore);
    if (!selectedOutput) {
        console.warn('No MIDI output selected. Cannot send reboot command.');
        return;
    }

    const message = [
        SYSEX_START,
        SYSEX_DATO_ID,
        SYSEX_DRUM_ID,
        SYSEX_REBOOT_BOOTLOADER,
        SYSEX_END
    ];

    selectedOutput.send(message);
    console.log('Sent SysEx Reboot to Bootloader command:', message);
}

function playNote(noteNumber: number) {
    const { selectedOutput } = get(midiStore);

    if (selectedOutput) {
        selectedOutput.send([MIDI_NOTE_ON_CHANNEL1, noteNumber, NOTE_ON_VELOCITY]);

        activeMidiNote.set(noteNumber);
        selectedSampleMidiNote.set(noteNumber);

        setTimeout(() => {
            selectedOutput.send([MIDI_NOTE_OFF_CHANNEL1, noteNumber, NOTE_OFF_VELOCITY]);
            if (get(activeMidiNote) === noteNumber) {
                activeMidiNote.set(null);
            }
        }, NOTE_DURATION_MS);
    } else {
        console.warn('No MIDI output selected. Cannot play note.');
    }
}

export const midiStore = {
    subscribe,
    requestMidiAccess,
    connectDevice,
    disconnectDevice,
    playNote,
    requestIdentity,
    rebootToBootloader,
};
