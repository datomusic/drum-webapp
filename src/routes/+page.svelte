<script lang="ts">
	import { _ } from 'svelte-i18n'; // Only need _ for translation, locale is handled in layout
    import SampleTable from '$lib/components/SampleTable.svelte';
    import FirmwareUpdate from '$lib/components/FirmwareUpdate.svelte';
    import DeviceConnection from '$lib/components/DeviceConnection.svelte';
</script>

<div class="space-y-8">
    <h1 class="text-3xl font-bold text-gray-800">{$_('welcome')}</h1>
    <p class="text-lg text-gray-600">{@html $_('docs_link', { values: { link: `<a href="https://svelte.dev/docs/kit" class="text-blue-600 hover:underline">${$_('docs_text')}</a>` } })}</p>

    <p class="text-gray-700">{$_('greeting_message')}</p>

    <DeviceConnection />
    <SampleTable />
    <FirmwareUpdate />
</div>
