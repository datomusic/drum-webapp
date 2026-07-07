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
  import { FACTORY_SAMPLES } from '$lib/config/factorySamples';
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

  async function startMonitoring(): Promise<boolean> {
    errorMessage = null;

    const granted = await requestPermission();
    if (!granted) {
      errorMessage = audioInputState.error;
      return false;
    }
    await initializeAudioInput();

    try {
      await capture.open(audioInputState.selectedDeviceId ?? undefined);
      return true;
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to start monitoring: ${errorMessage}`);
      return false;
    }
  }

  async function onRecordClick() {
    if (capture.status === 'recorded') {
      capture.reset(); // falls back to idle when the mic was never opened
    }
    if (capture.status === 'idle') {
      const opened = await startMonitoring();
      if (!opened) return; // permission denied or open failed
    }
    await startRecording();
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

  let fileInput: HTMLInputElement;

  const MAX_LOAD_S = 5; // cap loaded files so the trim view stays usable

  /**
   * Decode an audio file into the capture buffer (mono, capture sample rate)
   * so it can be trimmed and gain-adjusted like a recording.
   */
  async function loadIntoBuffer(arrayBuffer: ArrayBuffer, name: string) {
    errorMessage = null;
    const ctx = new AudioContext();
    try {
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      let samples = audioBuffer.getChannelData(0);
      if (audioBuffer.numberOfChannels > 1) {
        const right = audioBuffer.getChannelData(1);
        samples = samples.map((v, i) => (v + right[i]) * 0.5);
      }
      if (audioBuffer.sampleRate !== capture.sampleRate) {
        samples = resampleLinear(samples, audioBuffer.sampleRate, capture.sampleRate);
      }
      if (samples.length > MAX_LOAD_S * capture.sampleRate) {
        samples = samples.slice(0, MAX_LOAD_S * capture.sampleRate);
      }
      capture.load(samples, capture.sampleRate);
      gainDb = 0;
      autoTrim(samples);
      logger.info(`Loaded ${name} into buffer (${samples.length} samples)`);
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to load ${name}: ${errorMessage}`);
    } finally {
      ctx.close();
    }
  }

  async function handleFileSelect(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (file) await loadIntoBuffer(await file.arrayBuffer(), file.name);
    input.value = '';
  }

  async function resetToFactory() {
    const slot = midiNoteState.selectedSample;
    if (slot === null) return;

    const filename = FACTORY_SAMPLES[slot];
    if (!filename) {
      errorMessage = $_('recorder_no_factory_sample');
      return;
    }

    try {
      const response = await fetch(`/factory_kit/${filename}`);
      if (!response.ok) {
        throw new Error(`Failed to load factory sample: ${response.statusText}`);
      }
      await loadIntoBuffer(await response.arrayBuffer(), filename);
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Factory sample load failed: ${errorMessage}`);
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

  {#if errorMessage}
    <p class="rounded bg-red-100 p-2 text-red-800">{errorMessage}</p>
  {/if}

  <div class="flex items-stretch gap-3">
    <div class="flex flex-col justify-center gap-1 self-center">
      <button
        class="flex h-8 w-8 cursor-pointer items-center justify-center rounded bg-blue-500 text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
        aria-label="Browse"
        onclick={() => fileInput?.click()}
        disabled={capture.status === 'recording' || isSaving}
        title="Browse for audio file"
      >
        <img src="icon_browse.svg" alt="" />
      </button>
      <button
        class="flex h-8 w-8 cursor-pointer items-center justify-center rounded bg-black text-white transition-colors hover:bg-green-600 disabled:cursor-not-allowed disabled:opacity-50"
        aria-label="Reset"
        onclick={resetToFactory}
        disabled={midiNoteState.selectedSample === null ||
          capture.status === 'recording' ||
          isSaving}
        title="Load factory sound"
      >
        <img src="icon_reset.svg" alt="" />
      </button>
    </div>
    <button
      class="h-20 w-20 self-center rounded-full bg-red-600 text-lg font-bold text-white disabled:opacity-50"
      onclick={onRecordClick}
      disabled={capture.status === 'recording'}
    >
      {capture.status === 'recording' ? $_('recorder_recording') : $_('recorder_record')}
    </button>
    <WaveformDisplay
      {capture}
      {gainFactor}
      {trimStartMs}
      {trimEndMs}
      durationMs={recordedDurationMs}
      liveWindowS={MAX_SELECTION_S}
      onTrimStartChange={onTrimStartInput}
      onTrimEndChange={onTrimEndInput}
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
    </div>
    <div class="flex flex-col justify-center gap-2">
      <button
        class="w-20 rounded-lg bg-teal-600 py-4 text-lg font-bold text-white disabled:opacity-50"
        onclick={playSelection}
        disabled={capture.status !== 'recorded'}
      >
        {$_('recorder_play')}
      </button>
      <button
        class="h-20 w-20 rounded-lg bg-yellow-400 text-lg font-bold disabled:opacity-50"
        onclick={saveToDevice}
        disabled={capture.status !== 'recorded' ||
          midiNoteState.selectedSample === null ||
          isSaving}
      >
        {isSaving ? $_('recorder_saving') : $_('recorder_save')}
      </button>
    </div>
  </div>

  {#if capture.status !== 'idle'}
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
  {/if}

  <input
    bind:this={fileInput}
    type="file"
    accept="audio/*,.wav,.mp3,.ogg,.flac,.m4a,.aac"
    style="display: none;"
    onchange={handleFileSelect}
  />
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
