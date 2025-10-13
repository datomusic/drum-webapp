<script lang="ts">
	import '../app.css';
	import { locale } from 'svelte-i18n';
	import { isDraggingOverWindow } from '$lib/stores/dragDropStore';
	import { midiState } from '$lib/stores/midi.svelte';
	import { initialize as initializeAudioInput, requestPermission } from '$lib/stores/audioInput.svelte';
	import { onMount } from 'svelte';
	import { createLogger } from '$lib/utils/logger';
	import Footer from '$lib/components/Footer.svelte';

	const logger = createLogger('Layout');

	let { children } = $props();

	// Initialize audio input store on mount
	onMount(() => {
		initializeAudioInput();
	});

	// Request audio permission when MIDI device connects
	// This improves UX by avoiding interruption during recording
	$effect(() => {
		if (midiState.isConnected) {
			logger.info('MIDI device connected, requesting audio permission...');
			requestPermission().catch((error) => {
				logger.warn('Failed to request audio permission: ' + (error instanceof Error ? error.message : String(error)));
			});
		}
	});

	const locales = [
		{ code: 'en', name: 'English' },
		{ code: 'de', name: 'Deutsch' },
		{ code: 'nl', name: 'Nederlands' }
	];

	let dragEnterCounter = 0;

	function handleWindowDragEnter(event: DragEvent) {
		event.preventDefault();
		dragEnterCounter++;
		if (dragEnterCounter === 1) {
			// Check if items being dragged are files
			if (event.dataTransfer?.types.includes('Files')) {
				isDraggingOverWindow.set(true);
			} else {
				// If not files, decrement counter as we won't activate the overlay
				dragEnterCounter--; 
			}
		}
	}

	function handleWindowDragOver(event: DragEvent) {
		event.preventDefault(); // Necessary to allow dropping and to keep dragover firing
		if (event.dataTransfer) {
			event.dataTransfer.dropEffect = 'copy';
		}
	}

	function handleWindowDragLeave(event: DragEvent) {
		event.preventDefault();
		dragEnterCounter--;
		if (dragEnterCounter === 0) {
			isDraggingOverWindow.set(false);
		}
	}

	function handleWindowDrop(event: DragEvent) {
		event.preventDefault();
		dragEnterCounter = 0;
		isDraggingOverWindow.set(false);
	}
</script>

<div
	class="app-container relative flex flex-col"
	ondragenter={handleWindowDragEnter}
	ondragover={handleWindowDragOver}
	ondragleave={handleWindowDragLeave}
	ondrop={handleWindowDrop}
	role="none"
>
	<header class="bg-white text-gray-800 p-4 text-center">
		<nav class="flex justify-between items-center max-w-screen-lg mx-auto">
			<div class="flex items-center gap-2">
				<img src="dato_drum_logo.svg" alt="Dato DRUM Logo" class="h-10 sm:h-10" />
			</div>
			<div class="flex items-center gap-2">
				<select
					id="language-select"
					bind:value={$locale}
					class="
						p-1.5 rounded-md border-none bg-gray-200 text-black cursor-pointer
						focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-white
					"
				>
					{#each locales as lang }
						<option value={lang.code}>{lang.name}</option>
					{/each}
				</select>
			</div>
		</nav>
	</header>

	<main class="p-4 flex-1">
		{@render children()}
	</main>

	<Footer />

	{#if $isDraggingOverWindow}
		<div
			class="fixed inset-0 bg-black opacity-50 z-[999]"
			aria-hidden="true"
		>
			<!-- This overlay covers the page -->
		</div>
	{/if}
</div>

<style>
	#language-select {
		text-transform: uppercase;
	}
	/* Make sure the elements in the dropdown are not uppercased */
	#language-select:active {
		text-transform: none;
	}
	.app-container {
		min-height: 100vh; /* Ensure the container takes full viewport height for drag events */
	}
</style>
