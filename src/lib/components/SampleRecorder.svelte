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
  import { createLogger } from '$lib/utils/logger';

  const logger = createLogger('SampleRecorder');

  const MAX_SELECTION_S = 1.0; // DRUM samples are max 1 second
  const PRE_ROLL_S = 0.15; // included before the record press so hits aren't missed
  const CAPTURE_S = 1.3; // total capture length, leaves room for trimming
  const RING_S = 2; // live monitor ring buffer length

  type Status = 'idle' | 'monitoring' | 'recording' | 'recorded';

  let status = $state<Status>('idle');
  let monitorLevel = $state(0); // 0..1 peak of recent audio
  let gainDb = $state(0);
  let trimStartMs = $state(0);
  let trimEndMs = $state(1000);
  let errorMessage = $state<string | null>(null);
  let canvasEl: HTMLCanvasElement;

  // Audio plumbing (not reactive)
  let audioContext: AudioContext | null = null;
  let mediaStream: MediaStream | null = null;
  let workletNode: AudioWorkletNode | null = null;
  let sourceNode: MediaStreamAudioSourceNode | null = null;
  let animationFrame = 0;

  // Live ring buffer at context sample rate
  let ringBuffer: Float32Array = new Float32Array(0);
  let ringWritePos = 0;

  // Recording capture
  let captureChunks: Float32Array[] = [];
  let captureLength = 0;
  let captureTarget = 0;

  // Frozen recording
  let recorded = $state<Float32Array | null>(null);
  let recordedSampleRate = 44100;

  let recordedDurationMs = $derived(
    recorded ? Math.floor((recorded.length / recordedSampleRate) * 1000) : 0
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
      await openStream(audioInputState.selectedDeviceId ?? undefined);
      status = 'monitoring';
      draw();
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to start monitoring: ${errorMessage}`);
    }
  }

  async function openStream(deviceId?: string) {
    stopStream();

    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        ...(deviceId && deviceId !== 'default' && { deviceId: { exact: deviceId } })
      }
    });

    audioContext = new AudioContext();
    recordedSampleRate = audioContext.sampleRate;
    ringBuffer = new Float32Array(Math.floor(RING_S * audioContext.sampleRate));
    ringWritePos = 0;

    await audioContext.audioWorklet.addModule(
      new URL('../services/worklets/capture-processor.js', import.meta.url)
    );

    sourceNode = audioContext.createMediaStreamSource(mediaStream);
    workletNode = new AudioWorkletNode(audioContext, 'capture-processor', {
      numberOfInputs: 1,
      numberOfOutputs: 0
    });
    workletNode.port.onmessage = (event: MessageEvent<Float32Array>) => {
      handleChunk(event.data);
    };
    sourceNode.connect(workletNode);
  }

  function handleChunk(chunk: Float32Array) {
    // Update level meter (smoothed peak)
    let peak = 0;
    for (let i = 0; i < chunk.length; i++) {
      const v = Math.abs(chunk[i]);
      if (v > peak) peak = v;
    }
    monitorLevel = Math.max(peak, monitorLevel * 0.9);

    // Write into ring buffer
    for (let i = 0; i < chunk.length; i++) {
      ringBuffer[ringWritePos] = chunk[i];
      ringWritePos = (ringWritePos + 1) % ringBuffer.length;
    }

    // Collect while recording
    if (status === 'recording') {
      captureChunks.push(chunk);
      captureLength += chunk.length;
      if (captureLength >= captureTarget) {
        finishRecording();
      }
    }
  }

  function startRecording() {
    if (!audioContext || status !== 'monitoring') return;

    const sr = audioContext.sampleRate;
    captureChunks = [readRingTail(Math.floor(PRE_ROLL_S * sr))];
    captureLength = captureChunks[0].length;
    captureTarget = Math.floor(CAPTURE_S * sr);
    status = 'recording';
  }

  function readRingTail(samples: number): Float32Array {
    const out = new Float32Array(samples);
    let pos = (ringWritePos - samples + ringBuffer.length * 2) % ringBuffer.length;
    for (let i = 0; i < samples; i++) {
      out[i] = ringBuffer[pos];
      pos = (pos + 1) % ringBuffer.length;
    }
    return out;
  }

  function finishRecording() {
    const merged = new Float32Array(captureLength);
    let offset = 0;
    for (const chunk of captureChunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    captureChunks = [];
    recorded = merged;
    gainDb = 0;
    trimStartMs = 0;
    trimEndMs = Math.min(1000, Math.floor((merged.length / recordedSampleRate) * 1000));
    status = 'recorded';
    logger.info(`Recorded ${merged.length} samples at ${recordedSampleRate}Hz`);
  }

  function recordAgain() {
    recorded = null;
    status = 'monitoring';
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

  function getSelection(): Float32Array {
    if (!recorded) return new Float32Array(0);
    const start = Math.floor((trimStartMs / 1000) * recordedSampleRate);
    const end = Math.min(recorded.length, Math.floor((trimEndMs / 1000) * recordedSampleRate));
    const out = new Float32Array(end - start);
    for (let i = 0; i < out.length; i++) {
      out[i] = Math.max(-1, Math.min(1, recorded[start + i] * gainFactor));
    }
    return out;
  }

  let isSaving = $state(false);

  async function saveToDevice() {
    const slot = midiNoteState.selectedSample;
    if (slot === null || isSaving) return;

    errorMessage = null;
    isSaving = true;

    try {
      let selection = getSelection();
      if (recordedSampleRate !== 44100) {
        selection = resampleLinear(selection, recordedSampleRate, 44100);
      }

      // Convert to 16-bit little-endian PCM for the upload queue's raw fast path
      const pcm = new DataView(new ArrayBuffer(selection.length * 2));
      for (let i = 0; i < selection.length; i++) {
        pcm.setInt16(i * 2, Math.round(selection[i] * 32767), true);
      }

      const file = new File([pcm.buffer], `recording-${Date.now()}.raw`, {
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

  function resampleLinear(input: Float32Array, fromRate: number, toRate: number): Float32Array {
    const ratio = fromRate / toRate;
    const output = new Float32Array(Math.round(input.length / ratio));
    for (let i = 0; i < output.length; i++) {
      const pos = i * ratio;
      const idx = Math.floor(pos);
      const frac = pos - idx;
      const next = idx + 1 < input.length ? input[idx + 1] : input[idx] || 0;
      output[i] = (input[idx] || 0) * (1 - frac) + next * frac;
    }
    return output;
  }

  function playSelection() {
    if (!audioContext || !recorded) return;
    const selection = getSelection();
    if (selection.length === 0) return;

    const buffer = audioContext.createBuffer(1, selection.length, recordedSampleRate);
    buffer.copyToChannel(selection, 0);
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);
    source.start();
  }

  async function onDeviceChange(event: Event) {
    const deviceId = (event.currentTarget as HTMLSelectElement).value;
    selectDevice(deviceId);
    if (status === 'monitoring' || status === 'recording') {
      try {
        await openStream(deviceId);
        status = 'monitoring';
      } catch (error) {
        errorMessage = error instanceof Error ? error.message : String(error);
      }
    }
  }

  function draw() {
    animationFrame = requestAnimationFrame(draw);
    if (!canvasEl) return;

    const ctx = canvasEl.getContext('2d');
    if (!ctx) return;

    const { width, height } = canvasEl;
    const midY = height / 2;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#00332e';
    ctx.fillRect(0, 0, width, height);

    if (status === 'recorded' && recorded) {
      drawWaveform(ctx, recorded, gainFactor, width, height);

      // Shade areas outside the trim selection
      const startX = (trimStartMs / recordedDurationMs) * width;
      const endX = (trimEndMs / recordedDurationMs) * width;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fillRect(0, 0, startX, height);
      ctx.fillRect(endX, 0, width - endX, height);
      ctx.fillStyle = '#ffd200';
      ctx.fillRect(startX - 2, 0, 4, height);
      ctx.fillRect(endX - 2, 0, 4, height);
    } else if (status === 'monitoring' || status === 'recording') {
      // Live scrolling view of the last second
      const last = readRingTail(Math.floor(recordedSampleRate * MAX_SELECTION_S));
      drawWaveform(ctx, last, 1, width, height);

      // Level meter bar along the bottom
      ctx.fillStyle = monitorLevel > 0.95 ? '#ff4b3e' : '#00e0c6';
      ctx.fillRect(0, height - 6, monitorLevel * width, 6);

      if (status === 'recording') {
        ctx.fillStyle = '#ff4b3e';
        ctx.beginPath();
        ctx.arc(width - 20, 20, 8, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      // Idle: flat line
      ctx.strokeStyle = '#00e0c6';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, midY);
      ctx.lineTo(width, midY);
      ctx.stroke();
    }
  }

  function drawWaveform(
    ctx: CanvasRenderingContext2D,
    samples: Float32Array,
    gain: number,
    width: number,
    height: number
  ) {
    const midY = height / 2;
    const samplesPerPixel = samples.length / width;

    ctx.strokeStyle = '#00e0c6';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x < width; x++) {
      const start = Math.floor(x * samplesPerPixel);
      const end = Math.min(samples.length, Math.floor((x + 1) * samplesPerPixel) + 1);
      let min = 0;
      let max = 0;
      for (let i = start; i < end; i++) {
        const v = Math.max(-1, Math.min(1, samples[i] * gain));
        if (v < min) min = v;
        if (v > max) max = v;
      }
      ctx.moveTo(x + 0.5, midY - max * (midY - 4));
      ctx.lineTo(x + 0.5, midY - min * (midY - 4) + 1);
    }
    ctx.stroke();
  }

  function stopStream() {
    workletNode?.port.close();
    workletNode?.disconnect();
    workletNode = null;
    sourceNode?.disconnect();
    sourceNode = null;
    mediaStream?.getTracks().forEach((track) => track.stop());
    mediaStream = null;
    audioContext?.close();
    audioContext = null;
  }

  onDestroy(() => {
    cancelAnimationFrame(animationFrame);
    stopStream();
  });
</script>

<section class="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4">
  <h2 class="text-xl font-bold">{$_('recorder_title')}</h2>

  {#if errorMessage}
    <p class="rounded bg-red-100 p-2 text-red-800">{errorMessage}</p>
  {/if}

  <div class="flex items-stretch gap-3">
    <canvas bind:this={canvasEl} width="640" height="160" class="min-w-0 flex-1 rounded-lg"></canvas>
    <div class="flex flex-col items-center gap-1">
      <input
        type="range"
        class="gain-slider"
        min="-24"
        max="24"
        step="3"
        disabled={status !== 'recorded'}
        value={gainDb}
        oninput={(e) => (gainDb = Number(e.currentTarget.value))}
        aria-label="{$_('recorder_quieter')} / {$_('recorder_louder')}"
      />
      <span class="text-xs">{gainDb > 0 ? '+' : ''}{gainDb} dB</span>
    </div>
  </div>

  {#if status === 'idle'}
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

    {#if status === 'monitoring' || status === 'recording'}
      <button
        class="rounded-lg bg-red-600 px-6 py-4 text-lg font-bold text-white disabled:opacity-50"
        onclick={startRecording}
        disabled={status === 'recording'}
      >
        {status === 'recording' ? $_('recorder_recording') : $_('recorder_record')}
      </button>
    {/if}

    {#if status === 'recorded' && recorded}
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
          onclick={recordAgain}
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
    height: 100%;
    min-height: 8rem;
  }

  .gain-slider:disabled {
    opacity: 0.3;
  }
</style>
