<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { midiState, disconnectDevice } from '$lib/stores/midi.svelte';
	import { audioInputState } from '$lib/stores/audioInput.svelte';
</script>

<footer class="bg-gray-200 p-4 text-center text-gray-600">
	<div class="flex justify-between items-center max-w-screen-lg mx-auto">
		<p>&copy; {new Date().getFullYear()} {$_('app_name')}</p>
		<div class="flex items-center gap-4">
			{#if audioInputState.selectedDevice}
				<div class="flex items-center gap-2 text-sm" title="Audio Input: {audioInputState.selectedDevice.label}">
					<div class="w-3 h-3 bg-orange-500 rounded-full"></div>
					<span class="hidden sm:inline">
						🎤 {audioInputState.selectedDevice.label || 'Microphone'}
					</span>
				</div>
			{/if}
			{#if midiState.isConnected}
				<button
					class="flex items-center gap-2 text-sm hover:text-gray-800 transition-colors"
					onclick={disconnectDevice}
					title={$_('device_connected_status', { values: { deviceName: midiState.selectedOutput?.name || 'Dato DRUM' } }) + ' - ' + $_('device_disconnect_button')}
				>
					<div class="w-3 h-3 bg-green-500 rounded-full"></div>
					<span class="hidden sm:inline">
						{$_('connected')}{#if midiState.firmwareVersion} ({midiState.firmwareVersion}){/if}
					</span>
				</button>
			{/if}
		</div>
	</div>
</footer>
