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

// Constants for MIDI note playback
const NOTE_ON_VELOCITY = 127; // Max velocity
const NOTE_OFF_VELOCITY = 0; // Velocity for note off (often ignored, but good practice)
const NOTE_DURATION_MS = 100; // Duration before sending Note Off for clicks/auditioning

// Create the writable store
const { subscribe, set, update } = writable<MidiState>(initialState);

// Writable store for the currently active MIDI note (for momentary visual feedback on button)
export const activeMidiNote = writable<number | null>(null);

// Writable store for the currently selected sample's MIDI note (for persistent selection/centering)
export const selectedSampleMidiNote = writable<number | null>(null);

// Function to update MIDI devices when state changes
function updateMidiDevices(midiAccess: MIDIAccess) {
    update(state => ({
        ...state,
        access: midiAccess,
        inputs: midiAccess.inputs,
        outputs: midiAccess.outputs,
        error: null,
    }));
}

// Request MIDI access from the browser
async function requestMidiAccess() {
    update(state => ({ ...state, isRequestingAccess: true, error: null }));
    try {
        if (!navigator.requestMIDIAccess) {
            throw new Error('Web MIDI API is not supported in this browser.');
        }

        const midiAccess = await navigator.requestMIDIAccess({ sysex: true });
        midiAccess.onstatechange = (event) => {
            console.log('MIDI state change:', event.port.name, event.port.state);
            updateMidiDevices(midiAccess); // Re-update devices on state change
            // If the selected device disconnects, clear selection
            if (event.port.state === 'disconnected' && get(midiStore).selectedOutput?.id === event.port.id) {
                disconnectDevice();
            }
        };
        updateMidiDevices(midiAccess);
        console.log('MIDI access granted:', midiAccess);
    } catch (err: any) {
        console.error('Failed to get MIDI access:', err);
        update(state => ({
            ...state,
            access: null,
            inputs: null,
            outputs: null,
            selectedInput: null,
            selectedOutput: null,
            isConnected: false,
            error: err.message || 'Failed to get MIDI access. Please ensure your device is connected and browser permissions are granted.',
        }));
    } finally {
        update(state => ({ ...state, isRequestingAccess: false }));
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
            // Strategy 1: Try to find an input with the exact same name as the selected output
            input = Array.from(currentInputs.values()).find(inputPort => inputPort.name === output.name);

            // Strategy 2: If not found, try to find an input whose name contains the output's name (case-insensitive)
            if (!input) {
                const outputNameLower = output.name?.toLowerCase();
                if (outputNameLower) {
                    input = Array.from(currentInputs.values()).find(inputPort => 
                        inputPort.name?.toLowerCase().includes(outputNameLower)
                    );
                }
            }

            // Strategy 3: If still not found, fall back to the general DRUM_DEVICE_FILTERS for inputs
            if (!input) {
                input = Array.from(currentInputs.values()).find(inputPort => {
                    const inputNameLower = inputPort.name?.toLowerCase();
                    return inputNameLower && DRUM_DEVICE_FILTERS.some(filter => inputNameLower.includes(filter));
                });
            }

            // If an input is found, attach a listener
            if (input) {
                input.onmidimessage = (event) => {
                    const data = event.data;
                    console.log('Incoming MIDI message:', data);
                    
                    const SYSEX_START = 0xF0;
                    
                    if (data[0] === SYSEX_START) {
                        console.log('Received SysEx message:', Array.from(data).map(b => b.toString(16).padStart(2, '0')).join(' '));
                        
                        const SYSEX_EXTRA_BYTE = 0x00;
                    
                        // Check if there's an unexpected 00 byte after F0
                        const hasExtraByte = data[1] === SYSEX_EXTRA_BYTE;
                        const offset = hasExtraByte ? 1 : 0;
                        
                        // SysEx command constants
                        const SYSEX_GENERAL_INFO = 0x06;
                        const SYSEX_IDENTITY_REPLY = 0x02;
                        
                        // Universal Non-Realtime Identity Reply
                        if (data[1 + offset] === SYSEX_UNIVERSAL_NONREALTIME_ID && 
                            data[3 + offset] === SYSEX_GENERAL_INFO && 
                            data[4 + offset] === SYSEX_IDENTITY_REPLY) {
                            
                            const major = data[10 + offset];
                            const minor = data[11 + offset];
                            const patch = data[12 + offset];
                            const commits = data[13 + offset];

                            const fwVersion = `${major}.${minor}.${patch} (${commits} commits)`;
                            console.log(`Identified device firmware: ${fwVersion}`);

                            update(state => ({
                                ...state,
                                firmwareVersion: fwVersion,
                            }));
                        } else {
                            console.log('Unknown SysEx message format - couldn\'t parse identity reply.');
                        }
                    }

                    // MIDI message constants
                    const MIDI_STATUS_MASK = 0xF0;
                    const MIDI_NOTE_ON = 0x90;
                    const MIDI_NOTE_OFF = 0x80;
                    
                    const [statusCode, noteNumber, velocity] = event.data;
                    
                    // Check for Note On (0x9n) on any channel
                    if ((statusCode & MIDI_STATUS_MASK) === MIDI_NOTE_ON && velocity > 0) {
                        activeMidiNote.set(noteNumber);
                        selectedSampleMidiNote.set(noteNumber);
                    } 
                    // Check for Note Off (0x8n) on any channel, or Note On with velocity 0
                    else if ((statusCode & MIDI_STATUS_MASK) === MIDI_NOTE_OFF || 
                            ((statusCode & MIDI_STATUS_MASK) === MIDI_NOTE_ON && velocity === 0)) {
                        activeMidiNote.set(null);
                    }
                };
                console.log('Listening to MIDI input:', input.name);
            } else {
                console.warn('No matching MIDI input found for selected output device.');
            }

            update(state => ({
                ...state,
                selectedOutput: output,
                selectedInput: input || null, // Set the selected input
                isConnected: true,
                error: null,
                firmwareVersion: null,
            }));
            console.log('Connected to MIDI device:', output.name);
        } else {
            update(state => ({
                ...state,
                selectedOutput: null,
                selectedInput: null,
                isConnected: false,
                error: 'Selected device not found.',
                firmwareVersion: null,
            }));
            console.error('Device not found:', deviceId);
        }
    } else {
        update(state => ({
            ...state,
            selectedOutput: null,
            selectedInput: null,
            isConnected: false,
            error: 'MIDI outputs/inputs not available. Please request MIDI access first.',
            firmwareVersion: null,
        }));
        console.error('MIDI outputs/inputs not available.');
    }
}

// Disconnect from the current device
function disconnectDevice() {
    const currentMidiState = get(midiStore);
    if (currentMidiState.selectedInput) {
        currentMidiState.selectedInput.onmidimessage = null; // Remove listener
    }
    update(state => ({
        ...state,
        selectedOutput: null,
        selectedInput: null,
        isConnected: false,
        firmwareVersion: null,
    }));
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
