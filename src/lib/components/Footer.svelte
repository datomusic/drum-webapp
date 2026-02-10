<script lang="ts">
	import { _, locale } from "svelte-i18n";
	import { midiState, disconnectDevice } from "$lib/stores/midi.svelte";
	import { audioInputState, selectDevice } from "$lib/stores/audioInput.svelte";

	const locales = [
		{ code: "en", name: "English" },
		{ code: "de", name: "Deutsch" },
		{ code: "nl", name: "Nederlands" },
	];

	let showAudioDropdown = $state(false);

	function toggleAudioDropdown() {
		showAudioDropdown = !showAudioDropdown;
	}

	function handleSelectDevice(deviceId: string) {
		selectDevice(deviceId);
		showAudioDropdown = false;
	}

	function handleClickOutside(event: MouseEvent) {
		const target = event.target as HTMLElement;
		if (!target.closest(".audio-input-dropdown")) {
			showAudioDropdown = false;
		}
	}
</script>

<svelte:window onclick={handleClickOutside} />

<footer class="bg-white p-4 text-center text-gray-200">
	<div class="flex justify-between items-center max-w-screen-lg mx-auto">
		<div class="flex items-center gap-2">
			<select
				id="language-select"
				bind:value={$locale}
				class="
					text-sm text-gray-200 hover:text-gray-500 transition-colors cursor-pointer
					border-none bg-transparent
					focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-200
				"
			>
				{#each locales as lang}
					<option value={lang.code}>{lang.name}</option>
				{/each}
			</select>
		</div>
		<div class="flex items-center gap-4">
			{#if midiState.isConnected && audioInputState.selectedDevice}
				<div class="relative audio-input-dropdown">
					<button
						class="flex items-center gap-2 text-sm hover:text-gray-500 transition-colors cursor-pointer"
						onclick={toggleAudioDropdown}
						title="Audio Input: {audioInputState.selectedDevice.label}"
					>
						<span class="hidden sm:inline">
							{audioInputState.selectedDevice.label || "Microphone"}
						</span>
						<svg
							class="w-3 h-3"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M19 9l-7 7-7-7"
							></path>
						</svg>
					</button>

					{#if showAudioDropdown && audioInputState.devices.length > 0}
						<div
							class="absolute bottom-full mb-2 right-0 bg-white border border-gray-300 rounded shadow-lg min-w-[200px] max-h-60 overflow-y-auto z-50"
						>
							{#each audioInputState.devices as device}
								<button
									class="w-full text-left px-4 py-2 hover:bg-gray-100 transition-colors flex items-center gap-2 text-sm"
									class:bg-gray-50={device.deviceId ===
										audioInputState.selectedDeviceId}
									class:font-semibold={device.deviceId ===
										audioInputState.selectedDeviceId}
									onclick={() => handleSelectDevice(device.deviceId)}
								>
									<span
										>{device.label ||
											`Device ${device.deviceId.substring(0, 8)}`}</span
									>
								</button>
							{/each}
						</div>
					{/if}
				</div>
			{/if}
			{#if midiState.isConnected}
				<button
					class="flex items-center gap-2 text-sm hover:text-gray-800 transition-colors"
					onclick={disconnectDevice}
					title={$_("device_connected_status", {
						values: {
							deviceName: midiState.selectedOutput?.name || "Dato DRUM",
						},
					}) +
						" - " +
						$_("device_disconnect_button")}
				>
					<span class="hidden sm:inline">
						{$_("connected")}{#if midiState.firmwareVersion}
							({midiState.firmwareVersion}){/if}
					</span>
				</button>
			{/if}
		</div>
	</div>
</footer>

<style>
	#language-select {
		text-transform: uppercase;
	}
	/* Make sure the elements in the dropdown are not uppercased */
	#language-select:active {
		text-transform: none;
	}
</style>
