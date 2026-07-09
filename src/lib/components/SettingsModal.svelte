<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { midiState, disconnectDevice } from '$lib/stores/midi.svelte';
  import { audioInputState, selectDevice } from '$lib/stores/audioInput.svelte';

  let open = $state(false);

  function onDeviceChange(event: Event) {
    selectDevice((event.currentTarget as HTMLSelectElement).value);
  }

  function handleDisconnect() {
    disconnectDevice();
    open = false;
  }

  function onWindowKeydown(event: KeyboardEvent) {
    if (open && event.key === 'Escape') {
      open = false;
    }
  }

  function onBackdropClick(event: MouseEvent) {
    // Only close when the backdrop itself is clicked, not the panel
    if (event.target === event.currentTarget) {
      open = false;
    }
  }
</script>

<svelte:window onkeydown={onWindowKeydown} />

<button
  class="fixed top-4 right-4 z-40 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800"
  aria-label={$_('settings_title')}
  title={$_('settings_title')}
  onclick={() => (open = true)}
>
  <svg class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
    <path
      stroke-linecap="round"
      stroke-linejoin="round"
      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
    />
    <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
</button>

{#if open}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    role="dialog"
    aria-modal="true"
    aria-labelledby="settings-title"
    tabindex="-1"
    onclick={onBackdropClick}
    onkeydown={onWindowKeydown}
  >
    <div class="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
      <h2 id="settings-title" class="text-xl font-bold text-gray-900">
        {$_('settings_title')}
      </h2>

      <div class="mt-3 flex flex-col gap-4">
        {#if midiState.isConnected}
          <div class="flex items-center justify-between gap-2">
            <p class="text-gray-700">
              {$_('device_connected_status', {
                values: { deviceName: midiState.selectedOutput?.name || 'Dato DRUM' }
              })}{#if midiState.firmwareVersion}
                ({midiState.firmwareVersion}){/if}
            </p>
            <button
              class="rounded bg-gray-500 px-4 py-2 text-white hover:bg-gray-600"
              onclick={handleDisconnect}
            >
              {$_('device_disconnect_button')}
            </button>
          </div>
        {:else}
          <p class="text-gray-700">{$_('settings_not_connected')}</p>
        {/if}

        {#if audioInputState.devices.length > 0}
          <label class="flex flex-col gap-1 text-sm text-gray-700">
            {$_('recorder_choose_mic')}
            <select
              class="rounded border p-2"
              value={audioInputState.selectedDeviceId}
              onchange={onDeviceChange}
            >
              {#each audioInputState.devices as device (device.deviceId)}
                <option value={device.deviceId}>
                  {device.label || $_('recorder_unknown_mic')}
                </option>
              {/each}
            </select>
          </label>
        {/if}
      </div>

      <div class="mt-4 flex justify-end">
        <button
          class="rounded bg-gray-500 px-4 py-2 text-white hover:bg-gray-600"
          onclick={() => (open = false)}
        >
          {$_('settings_close')}
        </button>
      </div>
    </div>
  </div>
{/if}
