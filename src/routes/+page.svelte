<script lang="ts">
	import { _ } from 'svelte-i18n'; // Only need _ for translation, locale is handled in layout
    import SampleTable from '$lib/components/SampleTable.svelte';
    import DeviceConnection from '$lib/components/DeviceConnection.svelte';
    import { midiStore } from '$lib/stores/midi';
    import { derived } from 'svelte/store';
    import { LATEST_FIRMWARE_VERSION } from '$lib/config/firmware';
    import { isNewerVersion } from '$lib/utils/versioning';

    // Derived store to check if a firmware update is available
    const firmwareUpdateAvailable = derived(midiStore, ($midiStore) => {
        if ($midiStore.isConnected) {
            return isNewerVersion($midiStore.firmwareVersion, LATEST_FIRMWARE_VERSION);
        }
        return false;
    });
</script>

{#if !$midiStore.isConnected || $firmwareUpdateAvailable}
    <div class="fixed inset-0 flex items-center justify-center bg-gray-50">
        <DeviceConnection />
    </div>
{:else}
    <div class="space-y-8">
        <SampleTable />
    </div>
{/if}
