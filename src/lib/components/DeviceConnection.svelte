<script lang="ts">
    import { _ } from 'svelte-i18n';
    import { midiStore } from '$lib/stores/midi';
    import { onMount } from 'svelte';
    import { derived } from 'svelte/store'; // Import derived for reactive filtering

    let selectedDeviceId: string | undefined;

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

    function handleConnect() {
        if (selectedDeviceId) {
            midiStore.connectDevice(selectedDeviceId);
        }
    }

    function handleDisconnect() {
        midiStore.disconnectDevice();
        selectedDeviceId = undefined; // Clear selection on disconnect
    }
</script>

<section class="p-4  bg-white">
    <div class="mt-4 bg-gray-100 p-3 rounded">
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
            <p class="text-green-600">{$_('device_connected_status', { values: { deviceName: $midiStore.selectedOutput?.name || 'Dato DRUM' } })}</p>
            <button class="mt-2 px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600" on:click={handleDisconnect}>
                {$_('device_disconnect_button')}
            </button>
        {:else}
            <p class="text-gray-600">{$_('device_not_connected_status')}</p>
            {#if $filteredOutputs.length > 0}
                <div class="mt-2">
                    <label for="midi-device-select" class="block text-sm font-medium text-gray-700">{$_('select_midi_device')}</label>
                    <select
                        id="midi-device-select"
                        class="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                        bind:value={selectedDeviceId}
                    >
                        <option value="" disabled>{$_('choose_device_option')}</option>
                        {#each $filteredOutputs as output}
                            <option value={output.id}>{output.name}</option>
                        {/each}
                    </select>
                </div>
                <button
                    class="mt-2 px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    on:click={handleConnect}
                    disabled={!selectedDeviceId}
                >
                    {$_('device_connection_button')}
                </button>
            {:else}
                <p class="text-gray-600 mt-2">{$_('no_midi_devices_found')}</p>
            {/if}
        {/if}
    </div>
</section>
