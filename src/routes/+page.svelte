<script lang="ts">
	import { _ } from 'svelte-i18n'; // Only need _ for translation, locale is handled in layout
    import SampleTable from '$lib/components/SampleTable.svelte';
    import DeviceConnection from '$lib/components/DeviceConnection.svelte';
    import { midiStore } from '$lib/stores/midi';
</script>

{#if !$midiStore.isConnected}
    <div class="fixed inset-0 flex items-center justify-center bg-gray-50">
        <DeviceConnection />
    </div>
{:else}
    <div class="space-y-8">
        <SampleTable />
    </div>
{/if}
