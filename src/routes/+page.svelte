<script lang="ts">
    import { _ } from "svelte-i18n"; // Only need _ for translation, locale is handled in layout
    import SampleTable from "$lib/components/SampleTable.svelte";
    import DeviceConnection from "$lib/components/DeviceConnection.svelte";
    import SampleRecorder from "$lib/components/SampleRecorder.svelte";
    import LegacyFirmwareUpgrade from "$lib/components/LegacyFirmwareUpgrade.svelte";
    import { midiState } from "$lib/stores/midi.svelte";
    import { featureFlags } from "$lib/stores/featureFlags.svelte";
</script>

{#if !midiState.isConnected}
    <div class="fixed inset-0 flex items-start justify-center bg-[#009b8c]">
        <DeviceConnection />
    </div>
{:else}
    <SampleTable />
    {#if featureFlags.sampleRecorder}
        <SampleRecorder />
    {/if}
{/if}

<!-- Rendered unconditionally: the upgrade dialog must stay visible after the
     device disconnects when it reboots into UF2 downloader mode -->
<LegacyFirmwareUpgrade />

