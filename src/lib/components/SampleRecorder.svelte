<script lang="ts">
  import { onDestroy } from 'svelte';
  import { _ } from 'svelte-i18n';
  import {
    audioInputState,
    initialize as initializeAudioInput,
    requestPermission,
    selectDevice
  } from '$lib/stores/audioInput.svelte';
  import { midiNoteState } from '$lib/stores/midi.svelte';
  import { sampleUploadStore } from '$lib/stores/sampleUpload';
  import { SampleCapture } from '$lib/services/sampleCapture.svelte';
  import {
    computeEnvelope,
    findFirstTransient,
    findQuietEnd,
    resampleLinear,
    floatTo16BitPcm
  } from '$lib/services/audioAnalysis';
  import WaveformDisplay from './WaveformDisplay.svelte';
  import { createLogger } from '$lib/utils/logger';

  const logger = createLogger('SampleRecorder');

  const MAX_SELECTION_S = 1.0; // DRUM samples are max 1 second

  const capture = new SampleCapture();

  let gainDb = $state(0);
  let trimStartMs = $state(0);
  let trimEndMs = $state(1000);
  let errorMessage = $state<string | null>(null);
  let isSaving = $state(false);

  let recordedDurationMs = $derived(
    capture.recorded ? Math.floor((capture.recorded.length / capture.sampleRate) * 1000) : 0
  );
  let gainFactor = $derived(Math.pow(10, gainDb / 20));

  async function startMonitoring() {
    errorMessage = null;

    const granted = await requestPermission();
    if (!granted) {
      errorMessage = audioInputState.error;
      return;
    }
    await initializeAudioInput();

    try {
      await capture.open(audioInputState.selectedDeviceId ?? undefined);
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to start monitoring: ${errorMessage}`);
    }
  }

  async function startRecording() {
    const samples = await capture.record();
    gainDb = 0;
    autoTrim(samples);
  }

  /**
   * Snap the trim markers around the first transient: start just before the
   * onset (keeping a few ms of attack), end at a quiet spot after the decay.
   * Falls back to the full window when nothing is found.
   */
  function autoTrim(samples: Float32Array) {
    const durationMs = Math.floor((samples.length / capture.sampleRate) * 1000);
    const env = computeEnvelope(samples, capture.sampleRate);
    const onsetFrame = env ? findFirstTransient(env) : null;

    trimStartMs = onsetFrame !== null && env ? Math.max(0, onsetFrame * env.hopMs - 10) : 0;
    trimEndMs = Math.min(trimStartMs + MAX_SELECTION_S * 1000, durationMs);

    if (env && onsetFrame !== null) {
      const maxFrame = Math.floor(trimEndMs / env.hopMs);
      const quietFrame = findQuietEnd(env, onsetFrame, maxFrame);
      if (quietFrame !== null) {
        // Small pad after the decay point; never shorter than 100ms
        const candidate = quietFrame * env.hopMs + 20;
        trimEndMs = Math.min(trimEndMs, Math.max(trimStartMs + 100, candidate));
      }
    }
  }

  function onTrimStartInput(value: number) {
    trimStartMs = Math.min(value, trimEndMs - 10);
    if (trimEndMs - trimStartMs > MAX_SELECTION_S * 1000) {
      trimEndMs = trimStartMs + MAX_SELECTION_S * 1000;
    }
  }

  function onTrimEndInput(value: number) {
    trimEndMs = Math.max(value, trimStartMs + 10);
    if (trimEndMs - trimStartMs > MAX_SELECTION_S * 1000) {
      trimStartMs = trimEndMs - MAX_SELECTION_S * 1000;
    }
  }

  /** The trimmed selection with gain applied, clamped to [-1, 1]. */
  function getSelection(): Float32Array {
    const recorded = capture.recorded;
    if (!recorded) return new Float32Array(0);
    const start = Math.floor((trimStartMs / 1000) * capture.sampleRate);
    const end = Math.min(recorded.length, Math.floor((trimEndMs / 1000) * capture.sampleRate));
    const out = new Float32Array(end - start);
    for (let i = 0; i < out.length; i++) {
      out[i] = Math.max(-1, Math.min(1, recorded[start + i] * gainFactor));
    }
    return out;
  }

  async function saveToDevice() {
    const slot = midiNoteState.selectedSample;
    if (slot === null || isSaving) return;

    errorMessage = null;
    isSaving = true;

    try {
      let selection = getSelection();
      if (capture.sampleRate !== 44100) {
        selection = resampleLinear(selection, capture.sampleRate, 44100);
      }

      // 16-bit little-endian PCM for the upload queue's raw fast path
      const pcm = floatTo16BitPcm(selection);
      const file = new File([pcm], `recording-${Date.now()}.raw`, {
        type: 'audio/x-raw-pcm'
      });

      await sampleUploadStore.quickUpload(file, slot);
      logger.info(`Saved recording to slot ${slot}`);
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Save to device failed: ${errorMessage}`);
    } finally {
      isSaving = false;
    }
  }

  function playSelection() {
    capture.play(getSelection());
  }

  async function onDeviceChange(event: Event) {
    const deviceId = (event.currentTarget as HTMLSelectElement).value;
    selectDevice(deviceId);
    if (capture.status === 'monitoring' || capture.status === 'recording') {
      try {
        await capture.open(deviceId);
      } catch (error) {
        errorMessage = error instanceof Error ? error.message : String(error);
      }
    }
  }

  onDestroy(() => {
    capture.close();
  });
</script>

<section class="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4">
  <h2 class="text-xl font-bold">{$_('recorder_title')}</h2>

  {#if errorMessage}
    <p class="rounded bg-red-100 p-2 text-red-800">{errorMessage}</p>
  {/if}

  <div class="flex items-stretch gap-3">
    <WaveformDisplay
      {capture}
      {gainFactor}
      {trimStartMs}
      {trimEndMs}
      durationMs={recordedDurationMs}
      liveWindowS={MAX_SELECTION_S}
    />
    <div class="flex flex-col items-center gap-1">
      <input
        type="range"
        class="gain-slider"
        min="-24"
        max="24"
        step="3"
        disabled={capture.status !== 'recorded'}
        value={gainDb}
        oninput={(e) => (gainDb = Number(e.currentTarget.value))}
        aria-label="{$_('recorder_quieter')} / {$_('recorder_louder')}"
      />
      <span class="text-xs">{gainDb > 0 ? '+' : ''}{gainDb} dB</span>
    </div>
  </div>

  {#if capture.status === 'idle'}
    <button
      class="rounded-lg bg-teal-600 px-6 py-4 text-lg font-bold text-white"
      onclick={startMonitoring}
    >
      {$_('recorder_start_mic')}
    </button>
  {:else}
    {#if audioInputState.devices.length > 1}
      <label class="flex flex-col gap-1 text-sm">
        {$_('recorder_choose_mic')}
        <select
          class="rounded border p-2"
          value={audioInputState.selectedDeviceId}
          onchange={onDeviceChange}
        >
          {#each audioInputState.devices as device (device.deviceId)}
            <option value={device.deviceId}>{device.label || $_('recorder_unknown_mic')}</option>
          {/each}
        </select>
      </label>
    {/if}

    {#if capture.status === 'monitoring' || capture.status === 'recording'}
      <button
        class="rounded-lg bg-red-600 px-6 py-4 text-lg font-bold text-white disabled:opacity-50"
        onclick={startRecording}
        disabled={capture.status === 'recording'}
      >
        {capture.status === 'recording' ? $_('recorder_recording') : $_('recorder_record')}
      </button>
    {/if}

    {#if capture.status === 'recorded' && capture.recorded}
      <div class="flex flex-col gap-2">
        <label class="flex flex-col gap-1 text-sm">
          {$_('recorder_trim_start')}
          <input
            type="range"
            min="0"
            max={recordedDurationMs}
            value={trimStartMs}
            oninput={(e) => onTrimStartInput(Number(e.currentTarget.value))}
          />
        </label>
        <label class="flex flex-col gap-1 text-sm">
          {$_('recorder_trim_end')}
          <input
            type="range"
            min="0"
            max={recordedDurationMs}
            value={trimEndMs}
            oninput={(e) => onTrimEndInput(Number(e.currentTarget.value))}
          />
        </label>
      </div>

      <div class="flex gap-2">
        <button
          class="flex-1 rounded-lg bg-teal-600 px-6 py-4 text-lg font-bold text-white"
          onclick={playSelection}
        >
          {$_('recorder_play')}
        </button>
        <button
          class="flex-1 rounded-lg bg-yellow-400 px-6 py-4 text-lg font-bold disabled:opacity-50"
          onclick={saveToDevice}
          disabled={midiNoteState.selectedSample === null || isSaving}
        >
          {isSaving ? $_('recorder_saving') : $_('recorder_save')}
        </button>
        <button
          class="flex-1 rounded-lg bg-red-600 px-6 py-4 text-lg font-bold text-white"
          onclick={() => capture.reset()}
        >
          {$_('recorder_again')}
        </button>
      </div>
    {/if}
  {/if}
</section>

<style>
  .gain-slider {
    writing-mode: vertical-lr;
    direction: rtl;
    flex: 1;
    min-height: 0;
  }

  .gain-slider:disabled {
    opacity: 0.3;
  }
</style>
