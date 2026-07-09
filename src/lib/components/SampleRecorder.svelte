<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import { _ } from 'svelte-i18n';
  import {
    audioInputState,
    initialize as initializeAudioInput,
    requestPermission
  } from '$lib/stores/audioInput.svelte';
  import { midiNoteState } from '$lib/stores/midi.svelte';
  import { sampleUploadStore } from '$lib/stores/sampleUpload';
  import { downloadState, downloadSample, cancelDownload } from '$lib/stores/sampleDownload.svelte';
  import { SampleCapture } from '$lib/services/sampleCapture.svelte';
  import {
    computeEnvelope,
    findFirstTransient,
    findQuietEnd,
    resampleLinear,
    floatTo16BitPcm,
    decodeToMono
  } from '$lib/services/audioAnalysis';
  import WaveformDisplay from './WaveformDisplay.svelte';
  import { FACTORY_SAMPLES } from '$lib/config/factorySamples';
  import {
    getCachedSample,
    hasDeviceSample,
    cacheDeviceSample,
    preloadFactorySamples
  } from '$lib/stores/sampleCache';
  import { featureFlags } from '$lib/stores/featureFlags.svelte';
  import { createLogger } from '$lib/utils/logger';

  const logger = createLogger('SampleRecorder');

  const MAX_SELECTION_S = 1.0; // DRUM samples are max 1 second

  const capture = new SampleCapture();

  let gainDb = $state(0);
  let trimStartMs = $state(0);
  let trimEndMs = $state(1000);
  let errorMessage = $state<string | null>(null);
  let isSaving = $state(false);

  let isDownloading = $derived(downloadState.status === 'downloading');

  // Track which slot we last loaded so we don't reload on every trigger
  let lastLoadedSlot: number | null = null;

  // Warm the cache so pad selection can show factory audio instantly
  preloadFactorySamples();

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
      // The device now holds exactly this audio — no need to download it back
      cacheDeviceSample(slot, selection, 44100);
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
   * Decode an audio file (mono, capture sample rate), capping long files so
   * the trim view stays usable, and load it into the editor with auto-trim.
   */
  async function loadFileIntoEditor(arrayBuffer: ArrayBuffer, name: string) {
    errorMessage = null;
    try {
      let { samples, sampleRate } = await decodeToMono(arrayBuffer);
      if (samples.length > MAX_LOAD_S * sampleRate) {
        samples = samples.slice(0, MAX_LOAD_S * sampleRate);
      }
      loadIntoEditor(samples, sampleRate, 'auto');
      logger.info(`Loaded ${name} into buffer (${samples.length} samples)`);
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to load ${name}: ${errorMessage}`);
    }
  }

  async function handleFileSelect(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (file) await loadFileIntoEditor(await file.arrayBuffer(), file.name);
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
      await loadFileIntoEditor(await response.arrayBuffer(), filename);
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Factory sample load failed: ${errorMessage}`);
    }
  }

  function playSelection() {
    capture.play(getSelection());
  }

  /**
   * Put a sample buffer into the editor and reset gain, then set the trim
   * markers per `trim`: 'auto' snaps to the detected transient/decay,
   * 'full' selects the whole (max 1s) sample.
   */
  function loadIntoEditor(samples: Float32Array, sampleRate: number, trim: 'auto' | 'full') {
    capture.load(samples, sampleRate);
    gainDb = 0;
    const loaded = capture.recorded ?? samples;
    if (trim === 'auto') {
      autoTrim(loaded);
    } else {
      const durationMs = Math.floor((loaded.length / capture.sampleRate) * 1000);
      trimStartMs = 0;
      trimEndMs = Math.min(durationMs, MAX_SELECTION_S * 1000);
    }
  }

  // Load the slot's sample into the editor when a new note is selected.
  // Cached audio (device download, upload, or preloaded factory sample) is
  // shown instantly; the ~1s device download only runs when the
  // 'downloadOnSelect' feature flag is on and we don't already hold the
  // device's audio for this slot.
  $effect(() => {
    const slot = midiNoteState.selectedSample;
    if (slot === null) return;

    // Only load when the slot actually changed
    if (slot === lastLoadedSlot) return;
    lastLoadedSlot = slot;

    // Don't disturb an active recording or save
    untrack(() => {
      if (capture.status === 'recording' || isSaving) return;

      capture.reset();
      errorMessage = null;

      const cached = getCachedSample(slot);
      if (cached) {
        loadIntoEditor(cached.samples, cached.sampleRate, 'full');
        logger.info(`Loaded ${cached.source} sample for slot ${slot} from cache`);
      }

      if (!featureFlags.downloadOnSelect || hasDeviceSample(slot)) return;

      downloadSample(slot).then((result) => {
        if (result && result.samples.length > 0) {
          // Only load if the user hasn't moved on to another slot meanwhile
          if (midiNoteState.selectedSample === slot) {
            loadIntoEditor(result.samples, result.sampleRate, 'full');
            logger.info(`Loaded downloaded sample for slot ${slot} into buffer`);
          }
        } else if (downloadState.status === 'empty') {
          logger.info(`Slot ${slot} is empty on device`);
        }
      }).catch((error) => {
        // Errors are already logged and stored in downloadState
        logger.debug(`Download effect error for slot ${slot}: ${error}`);
      });
    });
  });

  // Reopen the capture stream when the microphone selection changes (in the
  // settings modal) while the stream is live
  $effect(() => {
    const deviceId = audioInputState.selectedDeviceId;
    untrack(() => {
      if (deviceId && (capture.status === 'monitoring' || capture.status === 'recording')) {
        capture.open(deviceId).catch((error) => {
          errorMessage = error instanceof Error ? error.message : String(error);
        });
      }
    });
  });

  onDestroy(() => {
    cancelDownload();
    capture.close();
  });
</script>

<section class="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4">

  {#if errorMessage}
    <p class="rounded bg-red-100 p-2 text-red-800">{errorMessage}</p>
  {/if}

  {#if downloadState.status === 'error' && downloadState.error}
    <p class="rounded bg-red-100 p-2 text-red-800">{$_('download_failed')}: {downloadState.error}</p>
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
      disabled={capture.status === 'recording' || isDownloading}
    >
      {capture.status === 'recording' ? $_('recorder_recording') : isDownloading ? $_('download_reading') : $_('recorder_record')}
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
          isSaving ||
          isDownloading}
      >
        {isSaving ? $_('recorder_saving') : $_('recorder_save')}
      </button>
    </div>
  </div>

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
