<script lang="ts">
    import { _ } from "svelte-i18n"; // Only need _ for translation, locale is handled in layout
    import SampleTable from "$lib/components/SampleTable.svelte";
    import DeviceConnection from "$lib/components/DeviceConnection.svelte";
    import { midiState } from "$lib/stores/midi.svelte";
</script>

{#if !midiState.isConnected}
    <div class="fixed inset-0 flex items-start justify-center bg-[#009b8c]">
        <DeviceConnection />
    </div>
{:else}
    <SampleTable />
{/if}
