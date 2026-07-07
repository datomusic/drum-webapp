/**
 * Sample Capture Engine
 *
 * Owns the Web Audio plumbing for the sample recorder: microphone stream,
 * AudioContext, capture worklet, live ring buffer, and recording capture.
 * Exposes reactive state (status, level, recorded) via Svelte 5 runes so
 * components can bind to it without touching the audio graph.
 *
 * Lifecycle: open() -> monitoring, record() -> recording -> recorded,
 * reset() -> monitoring, close() -> idle. Instantiate one per component
 * and call close() on destroy.
 */

import { createLogger } from '$lib/utils/logger';

const logger = createLogger('SampleCapture');

const PRE_ROLL_S = 0.15; // included before the record press so hits aren't missed
const CAPTURE_S = 1.3; // total capture length, leaves room for trimming
const RING_S = 2; // live monitor ring buffer length

export type CaptureStatus = 'idle' | 'monitoring' | 'recording' | 'recorded';

export class SampleCapture {
  status = $state<CaptureStatus>('idle');
  level = $state(0); // 0..1 smoothed peak of recent audio
  recorded = $state<Float32Array | null>(null);
  sampleRate = 44100;

  private audioContext: AudioContext | null = null;
  private playbackContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;

  private ringBuffer = new Float32Array(0);
  private ringWritePos = 0;

  private captureChunks: Float32Array[] = [];
  private captureLength = 0;
  private captureTarget = 0;
  private onCaptureComplete: ((samples: Float32Array) => void) | null = null;

  /**
   * Open the microphone stream and start monitoring. Reopens the stream
   * when called while already open (e.g. on device change).
   */
  async open(deviceId?: string): Promise<void> {
    this.close();

    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        ...(deviceId && deviceId !== 'default' && { deviceId: { exact: deviceId } })
      }
    });

    this.audioContext = new AudioContext();
    this.sampleRate = this.audioContext.sampleRate;
    this.ringBuffer = new Float32Array(Math.floor(RING_S * this.sampleRate));
    this.ringWritePos = 0;

    await this.audioContext.audioWorklet.addModule(
      new URL('./worklets/capture-processor.js', import.meta.url)
    );

    this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
    this.workletNode = new AudioWorkletNode(this.audioContext, 'capture-processor', {
      numberOfInputs: 1,
      numberOfOutputs: 0
    });
    this.workletNode.port.onmessage = (event: MessageEvent<Float32Array>) => {
      this.handleChunk(event.data);
    };
    this.sourceNode.connect(this.workletNode);
    this.status = 'monitoring';
  }

  /**
   * Capture a fixed-length recording, including pre-roll already sitting in
   * the ring buffer. Resolves with the samples once the target length is
   * reached; also sets `recorded` and flips status to 'recorded'.
   */
  record(): Promise<Float32Array> {
    if (!this.audioContext || this.status !== 'monitoring') {
      return Promise.reject(new Error('Not monitoring'));
    }

    return new Promise((resolve) => {
      this.captureChunks = [this.readRingTail(Math.floor(PRE_ROLL_S * this.sampleRate))];
      this.captureLength = this.captureChunks[0].length;
      this.captureTarget = Math.floor(CAPTURE_S * this.sampleRate);
      this.onCaptureComplete = resolve;
      this.status = 'recording';
    });
  }

  /**
   * Load an externally sourced buffer (browsed file, factory sample) as if it
   * had been recorded, so it can be trimmed and played back. Works without an
   * open microphone stream.
   */
  load(samples: Float32Array, sampleRate: number): void {
    if (!this.audioContext) {
      this.sampleRate = sampleRate;
    } else if (sampleRate !== this.sampleRate) {
      throw new Error(`Sample rate mismatch: ${sampleRate} vs ${this.sampleRate}`);
    }
    this.recorded = samples;
    this.status = 'recorded';
  }

  /**
   * Discard the current recording and go back to live monitoring, or to idle
   * when no microphone stream is open.
   */
  reset(): void {
    this.recorded = null;
    if (this.status === 'recorded') {
      this.status = this.audioContext ? 'monitoring' : 'idle';
    }
  }

  /** Last `seconds` of live audio from the ring buffer, oldest first. */
  readLiveWindow(seconds: number): Float32Array {
    return this.readRingTail(Math.floor(seconds * this.sampleRate));
  }

  /**
   * Play back a buffer of samples through the capture context, or a dedicated
   * playback context when the microphone is not open.
   */
  play(samples: Float32Array): void {
    if (samples.length === 0) return;
    const ctx = this.audioContext ?? (this.playbackContext ??= new AudioContext());
    const buffer = ctx.createBuffer(1, samples.length, this.sampleRate);
    buffer.copyToChannel(samples, 0);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start();
  }

  /** Tear down the stream and audio graph. Keeps `recorded` for playback-free UIs. */
  close(): void {
    this.workletNode?.port.close();
    this.workletNode?.disconnect();
    this.workletNode = null;
    this.sourceNode?.disconnect();
    this.sourceNode = null;
    this.mediaStream?.getTracks().forEach((track) => track.stop());
    this.mediaStream = null;
    this.audioContext?.close();
    this.audioContext = null;
    this.playbackContext?.close();
    this.playbackContext = null;
    this.onCaptureComplete = null;
    this.status = 'idle';
  }

  private handleChunk(chunk: Float32Array): void {
    // Update level meter (smoothed peak)
    let peak = 0;
    for (let i = 0; i < chunk.length; i++) {
      const v = Math.abs(chunk[i]);
      if (v > peak) peak = v;
    }
    this.level = Math.max(peak, this.level * 0.9);

    // Write into ring buffer
    for (let i = 0; i < chunk.length; i++) {
      this.ringBuffer[this.ringWritePos] = chunk[i];
      this.ringWritePos = (this.ringWritePos + 1) % this.ringBuffer.length;
    }

    // Collect while recording
    if (this.status === 'recording') {
      this.captureChunks.push(chunk);
      this.captureLength += chunk.length;
      if (this.captureLength >= this.captureTarget) {
        this.finishCapture();
      }
    }
  }

  private finishCapture(): void {
    const merged = new Float32Array(this.captureLength);
    let offset = 0;
    for (const chunk of this.captureChunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    this.captureChunks = [];
    this.recorded = merged;
    this.status = 'recorded';
    logger.info(`Recorded ${merged.length} samples at ${this.sampleRate}Hz`);
    this.onCaptureComplete?.(merged);
    this.onCaptureComplete = null;
  }

  private readRingTail(samples: number): Float32Array {
    const out = new Float32Array(samples);
    if (this.ringBuffer.length === 0) return out;
    let pos = (this.ringWritePos - samples + this.ringBuffer.length * 2) % this.ringBuffer.length;
    for (let i = 0; i < samples; i++) {
      out[i] = this.ringBuffer[pos];
      pos = (pos + 1) % this.ringBuffer.length;
    }
    return out;
  }
}
