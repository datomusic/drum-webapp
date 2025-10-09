import { createLogger } from '$lib/utils/logger';

const logger = createLogger('OnsetDetector');

export interface OnsetConfig {
  threshold: number;
  preRollMs: number;
  holdUs: number;
  timeoutMs: number;
  highpassHz?: number;
  captureMs: number; // total capture length AFTER preroll; total output = preRollMs + captureMs
}

/**
 * Capture a 1-channel Float32Array when an onset crosses a threshold,
 * including an optional pre-roll. Uses an AudioWorklet for low-latency detection.
 */
export async function captureOnset(
  stream: MediaStream,
  cfg: OnsetConfig
): Promise<{ samples: Float32Array; sampleRate: number }> {
  const AudioCtx: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
  const ac = new AudioCtx();

  await ac.audioWorklet.addModule(new URL('./worklets/onset-processor.js', import.meta.url));

  const src = ac.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(ac, 'onset-detector', { numberOfInputs: 1, numberOfOutputs: 0 });

  src.connect(node);

  node.port.postMessage({
    threshold: cfg.threshold,
    preRollMs: cfg.preRollMs,
    holdUs: cfg.holdUs,
    captureMs: cfg.captureMs,
    highpassHz: cfg.highpassHz ?? 80
  });

  return new Promise((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      try { src.disconnect(); } catch {}
      try { node.disconnect(); } catch {}
      node.port.onmessage = null;
      ac.close().catch(() => {});
    };

    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      logger.warn('Onset detection timed out');
      cleanup();
      reject(new Error('Onset detection timed out'));
    }, cfg.timeoutMs);

    node.port.onmessage = (e: MessageEvent) => {
      const data: any = (e as any).data;
      if (!data) return;

      if (data.type === 'trigger') {
        // could emit progress here if needed
        return;
      }

      if (data.type === 'data') {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);

        let samples: Float32Array;
        if (data.samples instanceof Float32Array) {
          samples = data.samples as Float32Array;
        } else if (data.samples instanceof ArrayBuffer) {
          samples = new Float32Array(data.samples as ArrayBuffer);
        } else if (data.buffer) {
          samples = new Float32Array(data.buffer as ArrayBuffer);
        } else {
          samples = Float32Array.from(data.samples);
        }

        cleanup();
        resolve({ samples, sampleRate: data.sampleRate as number });
      }
    };
  });
}
