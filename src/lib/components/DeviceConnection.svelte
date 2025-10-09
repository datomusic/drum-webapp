<script lang="ts">
    import { _ } from 'svelte-i18n';
    import {
        midiState,
        requestMidiAccess,
        connectDevice,
        disconnectDevice,
        requestIdentity,
        rebootToBootloader,
        ignoreFirmwareUpdate
    } from '$lib/stores/midi.svelte';
    import { onMount } from 'svelte';
    import { getLatestFirmware, getCurrentFirmwareVersion } from '$lib/config/firmware';
    import { isNewerVersion } from '$lib/utils/versioning';
    import { createLogger } from '$lib/utils/logger';

    let selectedDeviceId: string | undefined = $state();
    let userDisconnected: boolean = $state(false);
    let latestFirmwareInfo: { version: string; downloadUrl: string; size?: number } | null = $state(null);

    const logger = createLogger('DeviceConnection');

    // Define the filter array for Dato DRUM devices
    // A device will match if its name contains any of these strings (case-insensitive)
    const DRUM_DEVICE_FILTERS = ['DRUM', 'Dato DRUM', 'Pico'];

    // Derived value to hold the filtered list of MIDI outputs
    const filteredOutputs = $derived.by(() => {
        if (!midiState.outputs) {
            return [];
        }
        const lowerCaseFilters = DRUM_DEVICE_FILTERS.map(f => f.toLowerCase());
        return Array.from(midiState.outputs.values()).filter(output => {
            const outputNameLower = output.name?.toLowerCase();
            return outputNameLower && lowerCaseFilters.some(filter => outputNameLower.includes(filter));
        });
    });

    // Derived value to check if a firmware update is available and not ignored
    const firmwareUpdateAvailable = $derived.by(() => {
        if (midiState.isConnected && !midiState.ignoreFirmwareUpdate && latestFirmwareInfo) {
            // If firmwareVersion is null, it means we haven't received it yet or it's not supported.
            // In this case, we assume an update might be needed to prompt the user.
            return isNewerVersion(midiState.firmwareVersion, latestFirmwareInfo.version);
        }
        return false;
    });

    // Automatically request MIDI access and fetch latest firmware info when the component mounts
    onMount(async () => {
        requestMidiAccess();

        // Fetch latest firmware info
        try {
            latestFirmwareInfo = await getLatestFirmware();
            logger.info('Latest firmware info loaded: ' + JSON.stringify(latestFirmwareInfo), 'firmware');
        } catch (error) {
            logger.warn('Failed to fetch latest firmware info: ' + (error instanceof Error ? error.message : String(error)), 'firmware');
            // Use fallback values
            latestFirmwareInfo = {
                version: getCurrentFirmwareVersion(),
                downloadUrl: import.meta.env.MODE === 'development'
                    ? 'https://github.com/datomusic/drum-firmware/releases/latest'
                    : '/playground/drum-webapp/firmware/latest.uf2'
            };
        }
    });

    function handleConnect() {
        if (selectedDeviceId) {
            userDisconnected = false; // Reset the flag when a connection is attempted (manual or auto)
            connectDevice(selectedDeviceId);
        }
    }

    function handleDisconnect() {
        userDisconnected = true; // Set the flag to prevent immediate auto-reconnection
        disconnectDevice();
        selectedDeviceId = undefined; // Clear selection on disconnect
    }

    async function handleRebootToBootloader() {
        const confirmMessage = $_('reboot_bootloader_confirm');
        if (confirm(confirmMessage)) {
            await rebootToBootloader();
        }
    }

    // Effect to update selectedDeviceId when outputs change
    // This helps if the device was previously selected but is no longer connected
    $effect(() => {
        if (midiState.outputs && !midiState.selectedOutput && selectedDeviceId) {
            // If a device was previously selected but is no longer connected, clear selection
            if (!midiState.outputs.has(selectedDeviceId)) {
                selectedDeviceId = undefined;
            }
        }
    });

    // Effect for auto-selection
    $effect(() => {
        // Auto-select only if:
        // 1. Not connected
        // 2. There are filtered outputs
        // 3. No device is currently selected (selectedDeviceId is undefined)
        // 4. AND the user has NOT just initiated a disconnect
        if (!midiState.isConnected && filteredOutputs.length > 0 && selectedDeviceId === undefined && !userDisconnected) {
            selectedDeviceId = filteredOutputs[0].id;
        }
    });

    // Effect for auto-connection
    $effect(() => {
        // Auto-connect only if:
        // 1. A device is selected
        // 2. We are not currently connected
        // 3. AND the user has NOT just initiated a disconnect
        if (selectedDeviceId && !midiState.isConnected && !userDisconnected) {
            handleConnect();
        }
    });

    // Effect to request identity when connected and firmware version is not yet known
    $effect(() => {
        if (midiState.isConnected && midiState.selectedOutput && !midiState.firmwareVersion) {
            logger.debug('Device connected but no firmware version yet, requesting identity...', 'firmware');

            // Request identity immediately
            requestIdentity();

            // Also try again after a short delay in case the device needs time
            setTimeout(() => {
                if (midiState.isConnected && midiState.selectedOutput && !midiState.firmwareVersion) {
                    logger.debug('Retrying identity request after delay...', 'firmware');
                    requestIdentity();
                }
            }, 1000);
        }
    });
</script>

<section class="p-4 bg-white">
    <div class="bg-gray-100 p-3 rounded rounded max-w-screen-lg mx-auto items-center">
        {#if midiState.error}
            <p class="text-red-600 mb-2">{$_('midi_error_message', { values: { error: midiState.error } })}</p>
        {/if}

        {#if midiState.isRequestingAccess}
            <p class="text-blue-600">{$_('midi_requesting_access')}</p>
        {:else if midiState.access === null}
            <p class="text-orange-600">{$_('midi_not_supported')}</p>
            <button class="mt-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600" onclick={requestMidiAccess}>
                {$_('midi_request_access_button')}
            </button>
        {:else if midiState.isConnected && !firmwareUpdateAvailable}
            <p>
                {$_('device_connected_status', { values: { deviceName: midiState.selectedOutput?.name || 'Dato DRUM' } })}
                {#if midiState.firmwareVersion}
                    ({$_('firmware_version_label', { values: { version: midiState.firmwareVersion } })}){/if}
            </p>
            <div class="mt-2 flex gap-2">
                <button class="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600" onclick={handleDisconnect}>
                    {$_('device_disconnect_button')}
                </button>
                <button class="px-4 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600" onclick={handleRebootToBootloader}>
                    {$_('reboot_bootloader_button')}
                </button>
            </div>
        {:else if midiState.isConnected && firmwareUpdateAvailable}
            <p>
                {$_('device_connected_status', { values: { deviceName: midiState.selectedOutput?.name || 'Dato DRUM' } })}
                {#if midiState.firmwareVersion}
                    ({$_('firmware_version_label', { values: { version: midiState.firmwareVersion } })}){/if}
            </p>
            <p class="text-yellow-700 mt-2">
                {$_('firmware_update_available', { values: { currentVersion: midiState.firmwareVersion || 'Unknown', latestVersion: latestFirmwareInfo?.version || getCurrentFirmwareVersion() } })}
            </p>
            <div class="mt-2 flex gap-2">
                <a
                    href={latestFirmwareInfo?.downloadUrl || 'https://github.com/datomusic/drum-firmware/releases/latest'}
                    download
                    class="inline-block px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
                >
                    {$_('download_firmware_button')}
                </a>
                <button class="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600" onclick={ignoreFirmwareUpdate}>
                    {$_('ignore_firmware_update_button')}
                </button>
            </div>
            <div class="mt-2 flex gap-2">
                <button class="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600" onclick={handleDisconnect}>
                    {$_('device_disconnect_button')}
                </button>
                <button class="px-4 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600" onclick={handleRebootToBootloader}>
                    {$_('reboot_bootloader_button')}
                </button>
            </div>
        {:else}
            {#if filteredOutputs.length > 0}
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
                        {#each filteredOutputs as output}
                            <option value={output.id}>{output.name}</option>
                        {/each}
                    </select>
                    <button
                    class="mt-2 px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    onclick={handleConnect}
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
