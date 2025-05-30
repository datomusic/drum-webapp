import { writable, get } from 'svelte/store';

// Define types for MIDI state
interface MidiState {
    access: MIDIAccess | null;
    inputs: MIDIInputMap | null;
    outputs: MIDIOutputMap | null;
    selectedInput: MIDIInput | null;
    selectedOutput: MIDIOutput | null;
    isConnected: boolean;
    error: string | null;
    isRequestingAccess: boolean;
    firmwareVersion: string | null; // ADDED: To store the parsed firmware version
}

// Initial state for the MIDI store
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

// MIDI SysEx constants
const SYSEX_START = 0xF0;
const SYSEX_END = 0xF7;

const SYSEX_DATO_ID = 0x7D;
const SYSEX_DRUM_ID = 0x65;
const SYSEX_UNIVERSAL_NONREALTIME_ID = 0x7E;
const SYSEX_ALL_ID = 0x7F;
const SYSEX_REBOOT_BOOTLOADER = 0x0B;

// SysEx command constants
const SYSEX_GENERAL_INFO = 0x06;
const SYSEX_IDENTITY_REQUEST = 0x01;
const SYSEX_IDENTITY_REPLY = 0x02;

// MIDI message constants
const MIDI_STATUS_MASK = 0xF0;
const MIDI_NOTE_ON = 0x90;
const MIDI_NOTE_OFF = 0x80;
const MIDI_NOTE_ON_CHANNEL1 = 0x90;
const MIDI_NOTE_OFF_CHANNEL1 = 0x80;

// Define the filter array for Dato DRUM devices
// A device will match if its name contains any of these strings (case-insensitive)
const DRUM_DEVICE_FILTERS = ['DRUM', 'Dato DRUM', 'Pico'];
const DRUM_DEVICE_FILTERS_LOWER = DRUM_DEVICE_FILTERS.map(f => f.toLowerCase());

// Constants for MIDI note playback
const NOTE_ON_VELOCITY = 127; // Max velocity
const NOTE_OFF_VELOCITY = 0; // Velocity for note off (often ignored, but good practice)
const NOTE_DURATION_MS = 100; // Duration before sending Note Off for clicks/auditioning

// Helper function to parse SysEx Identity Reply messages
function parseSysExIdentityReply(data: Uint8Array): string | null {
    console.log('Received SysEx message for parsing:', Array.from(data).map(b => b.toString(16).padStart(2, '0')).join(' '));

    const SYSEX_EXTRA_BYTE = 0x00; // Some devices might send an extra 0x00 after 0xF0

    // Check if there's an unexpected 00 byte after F0 (data[0] is SYSEX_START)
    const hasExtraByte = data[1] === SYSEX_EXTRA_BYTE;
    const offset = hasExtraByte ? 1 : 0;

    // Check for Universal Non-Realtime Identity Reply
    // Expected structure: F0 7E <device_id> 06 02 ... F7
    // data[0] = F0 (SYSEX_START)
    // data[1+offset] = 7E (SYSEX_UNIVERSAL_NONREALTIME_ID)
    // data[2+offset] = <device_id> (SYSEX_ALL_ID in request, specific ID in reply)
    // data[3+offset] = 06 (SYSEX_GENERAL_INFO)
    // data[4+offset] = 02 (SYSEX_IDENTITY_REPLY)
    // Firmware version starts at data[10+offset] for Dato DRUM
    if (data.length > 13 + offset && // Ensure data is long enough for firmware version
        data[1 + offset] === SYSEX_UNIVERSAL_NONREALTIME_ID &&
        data[3 + offset] === SYSEX_GENERAL_INFO &&
        data[4 + offset] === SYSEX_IDENTITY_REPLY) {

        const major = data[10 + offset];
        const minor = data[11 + offset];
        const patch = data[12 + offset];
        const commits = data[13 + offset]; // Dato-specific: number of commits

        const fwVersion = `${major}.${minor}.${patch} (${commits} commits)`;
        console.log(`Identified device firmware: ${fwVersion}`);
        return fwVersion;
    } else {
        console.log('SysEx message is not a recognized Identity Reply or is malformed.');
        return null;
    }
}

// Helper function to handle MIDI Note On/Off messages
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

// Create the writable store
const { subscribe, set, update } = writable<MidiState>(initialState);

// --- Start of Internal State Update Actions ---

function _setIsRequestingAccess(isRequesting: boolean) {
    update(state => ({
        ...state,
        isRequestingAccess: isRequesting,
        error: isRequesting ? null : state.error, // Clear error only when starting request
    }));
}

function _setMidiAccessGranted(midiAccess: MIDIAccess) {
    update(state => ({
        ...state,
        access: midiAccess,
        inputs: midiAccess.inputs,
        outputs: midiAccess.outputs,
        error: null, // Successfully got access, clear previous errors
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
        error: null, // Successful connection, clear previous errors
    }));
}

function _setDeviceDisconnected() {
    update(state => ({
        ...state,
        selectedOutput: null,
        selectedInput: null,
        isConnected: false,
        firmwareVersion: null,
        error: null, // Disconnecting is a clean operation, clear errors
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

// Writable store for the currently active MIDI note (for momentary visual feedback on button)
export const activeMidiNote = writable<number | null>(null);

// Writable store for the currently selected sample's MIDI note (for persistent selection/centering)
export const selectedSampleMidiNote = writable<number | null>(null);

// Request MIDI access from the browser
async function requestMidiAccess() {
    _setIsRequestingAccess(true);
    try {
        if (!navigator.requestMIDIAccess) {
            throw new Error('Web MIDI API is not supported in this browser.');
        }

        const midiAccess = await navigator.requestMIDIAccess({ sysex: true });
        _setMidiAccessGranted(midiAccess); // Set initial access, devices, and clear error

        midiAccess.onstatechange = (event) => {
            console.log('MIDI state change:', event.port.name, event.port.state);
            _updateAvailableMidiDevices(midiAccess); // Re-update available devices
            // If the selected device disconnects, trigger disconnect logic
            if (event.port.state === 'disconnected' && get(midiStore).selectedOutput?.id === event.port.id) {
                disconnectDevice(); // This will use _setDeviceDisconnected
            }
        };
        // _setMidiAccessGranted already called, no need for another update here.
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

// Connect to a specific MIDI output device
function connectDevice(deviceId: string) {
    const currentMidiState = get(midiStore);
    const currentOutputs = currentMidiState.outputs;
    const currentInputs = currentMidiState.inputs;

    if (currentOutputs && currentInputs) {
        const output = currentOutputs.get(deviceId);
        let input: MIDIInput | undefined;

        if (output) {
            // Strategy 1: Try to find an input with the exact same name as the selected output.
            input = Array.from(currentInputs.values()).find(inputPort => inputPort.name === output.name);

            // Strategy 2: If not found, try to find an input matching DRUM_DEVICE_FILTERS (case-insensitive).
            if (!input) {
                input = Array.from(currentInputs.values()).find(inputPort => {
                    const inputNameLower = inputPort.name?.toLowerCase();
                    return inputNameLower && DRUM_DEVICE_FILTERS_LOWER.some(filter => inputNameLower.includes(filter));
                });
            }

            // If an input is found, attach a listener
            if (input) {
                input.onmidimessage = (event) => {
                    const data = event.data;
                    console.log('Incoming MIDI message:', data); // General log for any incoming message

                    if (data[0] === SYSEX_START) {
                        const fwVersion = parseSysExIdentityReply(data);
                        if (fwVersion) {
                            _setFirmwareVersion(fwVersion);
                        }
                    } else {
                        // Handle non-SysEx messages (like Note On/Off)
                        handleMidiNoteMessage(data);
                    }
                };
                console.log('Listening to MIDI input:', input.name);
            } else {
                console.warn('No matching MIDI input found for selected output device.');
                // Still connect to output, but input will be null
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

// Disconnect from the current device
function disconnectDevice() {
    const currentMidiState = get(midiStore);
    if (currentMidiState.selectedInput) {
        currentMidiState.selectedInput.onmidimessage = null; // Remove listener
    }
    _setDeviceDisconnected();
    activeMidiNote.set(null); // Clear active note on disconnect
    selectedSampleMidiNote.set(null); // Clear selected note on disconnect
    console.log('Disconnected from MIDI device.');
}

function requestIdentity() {
    const { selectedOutput } = get(midiStore);
    if (!selectedOutput) {
        console.warn('No MIDI output selected. Cannot request identity.');
        return;
    }

    const SYSEX_START = 0xF0;
    const SYSEX_END = 0xF7;
    const SYSEX_GENERAL_INFO = 0x06;
    const SYSEX_IDENTITY_REQUEST = 0x01;
    
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

    const SYSEX_START = 0xF0;
    const SYSEX_END = 0xF7;
    
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

// Function to play a MIDI note (for clicks/auditioning)
function playNote(noteNumber: number) {
    const { selectedOutput } = get(midiStore);

    if (selectedOutput) {
        selectedOutput.send([MIDI_NOTE_ON_CHANNEL1, noteNumber, NOTE_ON_VELOCITY]);

        activeMidiNote.set(noteNumber);
        selectedSampleMidiNote.set(noteNumber);

        // Schedule MIDI Note Off after a delay
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

// Export the store and actions
export const midiStore = {
    subscribe,
    requestMidiAccess,
    connectDevice,
    disconnectDevice,
    playNote,
    requestIdentity,
    rebootToBootloader,
};
