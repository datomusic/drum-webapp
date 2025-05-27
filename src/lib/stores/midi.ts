import { writable, get } from 'svelte/store';

// Define types for MIDI state
interface MidiState {
    access: MIDIAccess | null;
    inputs: MIDIInputMap | null;
    outputs: MIDIOutputMap | null;
    selectedOutput: MIDIOutput | null;
    isConnected: boolean;
    error: string | null;
    isRequestingAccess: boolean;
}

// Initial state for the MIDI store
const initialState: MidiState = {
    access: null,
    inputs: null,
    outputs: null,
    selectedOutput: null,
    isConnected: false,
    error: null,
    isRequestingAccess: false,
};

// Create the writable store
const { subscribe, set, update } = writable<MidiState>(initialState);

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

        const midiAccess = await navigator.requestMIDIAccess({ sysex: true }); // Request SYSEX access for firmware updates
        midiAccess.onstatechange = (event) => {
            console.log('MIDI state change:', event.port.name, event.port.state);
            updateMidiDevices(midiAccess); // Re-update devices on state change
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
    const currentOutputs = get(midiStore).outputs;
    if (currentOutputs) {
        const output = currentOutputs.get(deviceId);
        if (output) {
            update(state => ({
                ...state,
                selectedOutput: output,
                isConnected: true,
                error: null,
            }));
            console.log('Connected to MIDI device:', output.name);
        } else {
            update(state => ({
                ...state,
                selectedOutput: null,
                isConnected: false,
                error: 'Selected device not found.',
            }));
            console.error('Device not found:', deviceId);
        }
    } else {
        update(state => ({
            ...state,
            selectedOutput: null,
            isConnected: false,
            error: 'MIDI outputs not available. Please request MIDI access first.',
        }));
        console.error('MIDI outputs not available.');
    }
}

// Disconnect from the current device
function disconnectDevice() {
    update(state => ({
        ...state,
        selectedOutput: null,
        isConnected: false,
    }));
    console.log('Disconnected from MIDI device.');
}

// Export the store and actions
export const midiStore = {
    subscribe,
    requestMidiAccess,
    connectDevice,
    disconnectDevice,
};

// Automatically request MIDI access when the store is first used (e.g., on app load)
// This might be too aggressive; consider calling it explicitly from a component if preferred.
// requestMidiAccess();
