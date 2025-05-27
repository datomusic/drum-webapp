<script lang="ts">
	import { _ } from 'svelte-i18n'; // Only need _ for translation, locale is handled in layout
    import SampleTable from '$lib/components/SampleTable.svelte';
    import FirmwareUpdate from '$lib/components/FirmwareUpdate.svelte';
    import DeviceConnection from '$lib/components/DeviceConnection.svelte';
</script>

<div class="space-y-8">
    <DeviceConnection />
    <SampleTable />
    <FirmwareUpdate />
</div>
