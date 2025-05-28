<script lang="ts">
    import { _ } from 'svelte-i18n';
    import { midiStore } from '$lib/stores/midi';
    import { onMount } from 'svelte';
    import { derived } from 'svelte/store';

    let selectedDeviceId: string | undefined;
    let userDisconnected: boolean = false;

    // Define the filter array for Dato DRUM devices
    // A device will match if its name contains any of these strings (case-insensitive)
    const DRUM_DEVICE_FILTERS = ['DRUM', 'Dato DRUM', 'Pico']; 

    // Derived store to hold the filtered list of MIDI outputs
    const filteredOutputs = derived(midiStore, ($midiStore) => {
        if (!$midiStore.outputs) {
            return [];
        }
        const lowerCaseFilters = DRUM_DEVICE_FILTERS.map(f => f.toLowerCase());
        return Array.from($midiStore.outputs.values()).filter(output => {
            const outputNameLower = output.name?.toLowerCase();
            return outputNameLower && lowerCaseFilters.some(filter => outputNameLower.includes(filter));
        });
    });

    // Automatically request MIDI access when the component mounts
    onMount(() => {
        midiStore.requestMidiAccess();
    });

    // Reactive statement to update selectedDeviceId when outputs change
    // This helps if the device is connected/disconnected after initial load
    $: {
        if ($midiStore.outputs && !$midiStore.selectedOutput && selectedDeviceId) {
            // If a device was previously selected but is no longer connected, clear selection
            if (!$midiStore.outputs.has(selectedDeviceId)) {
                selectedDeviceId = undefined;
            }
        }
    }

    // Reactive statement for auto-selection
    $: {
        // Auto-select only if:
        // 1. Not connected
        // 2. There are filtered outputs
        // 3. No device is currently selected (selectedDeviceId is undefined)
        // 4. AND the user has NOT just initiated a disconnect
        if (!$midiStore.isConnected && $filteredOutputs.length > 0 && selectedDeviceId === undefined && !userDisconnected) {
            selectedDeviceId = $filteredOutputs[0].id;
        }
    }

    // Reactive statement for auto-connection
    $: {
        // Auto-connect only if:
        // 1. A device is selected
        // 2. We are not currently connected
        // 3. AND the user has NOT just initiated a disconnect
        if (selectedDeviceId && !$midiStore.isConnected && !userDisconnected) {
            handleConnect();
        }
    }

    // ADDED: Reactive statement to request identity when connected and firmware version is not yet known
    $: {
        if ($midiStore.isConnected && $midiStore.selectedOutput && !$midiStore.firmwareVersion) {
            midiStore.requestIdentity();
        }
    }

    function handleConnect() {
        if (selectedDeviceId) {
            userDisconnected = false; // Reset the flag when a connection is attempted (manual or auto)
            midiStore.connectDevice(selectedDeviceId);
        }
    }

    function handleDisconnect() {
        userDisconnected = true; // Set the flag to prevent immediate auto-reconnection
        midiStore.disconnectDevice();
        selectedDeviceId = undefined; // Clear selection on disconnect
    }
</script>

<section class="p-4  bg-white">
    <div class="bg-gray-100 p-3 rounded">
        {#if $midiStore.error}
            <p class="text-red-600 mb-2">{$_('midi_error_message', { values: { error: $midiStore.error } })}</p>
        {/if}

        {#if $midiStore.isRequestingAccess}
            <p class="text-blue-600">{$_('midi_requesting_access')}</p>
        {:else if $midiStore.access === null}
            <p class="text-orange-600">{$_('midi_not_supported')}</p>
            <button class="mt-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600" on:click={midiStore.requestMidiAccess}>
                {$_('midi_request_access_button')}
            </button>
        {:else if $midiStore.isConnected}
            <p>
                {$_('device_connected_status', { values: { deviceName: $midiStore.selectedOutput?.name || 'Dato DRUM' } })}
                {#if $midiStore.firmwareVersion}
                    ({$_('firmware_version_label', { values: { version: $midiStore.firmwareVersion } })}){/if}
                <button class="mt-2 px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600" on:click={handleDisconnect}>
                    {$_('device_disconnect_button')}
                </button>
            </p>
        {:else}
            {#if $filteredOutputs.length > 0}
                <div class="mt-2">
                    <label for="midi-device-select">{$_('select_midi_device')}</label>
                    <select
                        id="midi-device-select"
                        class="
                            p-1.5 rounded-md border-none bg-gray-200 text-black cursor-pointer
                            focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-white
                        "
                        bind:value={selectedDeviceId}
                    >
                        <option value="" disabled>{$_('choose_device_option')}</option>
                        {#each $filteredOutputs as output}
                            <option value={output.id}>{output.name}</option>
                        {/each}
                    </select>
                    <button
                    class="mt-2 px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    on:click={handleConnect}
                    disabled={!selectedDeviceId}
                >
                    {$_('device_connection_button')}
                </button>
                </div>
            {:else}
                <p>{$_('no_midi_devices_found')}</p>
            {/if}
        {/if}
    </div>
</section>
