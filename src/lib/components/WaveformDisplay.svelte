<script lang="ts">
  import { onMount } from 'svelte';
  import type { SampleCapture } from '$lib/services/sampleCapture.svelte';

  interface Props {
    capture: SampleCapture;
    gainFactor?: number;
    trimStartMs?: number;
    trimEndMs?: number;
    durationMs?: number;
    /** Length of the live scrolling view in seconds */
    liveWindowS?: number;
  }

  let {
    capture,
    gainFactor = 1,
    trimStartMs = 0,
    trimEndMs = 0,
    durationMs = 0,
    liveWindowS = 1
  }: Props = $props();

  let canvasEl: HTMLCanvasElement;

  onMount(() => {
    let animationFrame = requestAnimationFrame(draw);

    function draw() {
      animationFrame = requestAnimationFrame(draw);
      if (!canvasEl) return;

      const ctx = canvasEl.getContext('2d');
      if (!ctx) return;

      // Match the backing store to the displayed size for crisp rendering
      const dpr = window.devicePixelRatio || 1;
      const displayWidth = Math.round(canvasEl.clientWidth * dpr);
      const displayHeight = Math.round(canvasEl.clientHeight * dpr);
      if (canvasEl.width !== displayWidth || canvasEl.height !== displayHeight) {
        canvasEl.width = displayWidth;
        canvasEl.height = displayHeight;
      }

      const { width, height } = canvasEl;
      const midY = height / 2;

      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = '#00332e';
      ctx.fillRect(0, 0, width, height);

      if (capture.status === 'recorded' && capture.recorded && durationMs > 0) {
        drawWaveform(ctx, capture.recorded, gainFactor, width, height, dpr);

        // Shade areas outside the trim selection
        const startX = (trimStartMs / durationMs) * width;
        const endX = (trimEndMs / durationMs) * width;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(0, 0, startX, height);
        ctx.fillRect(endX, 0, width - endX, height);
        ctx.fillStyle = '#ffd200';
        ctx.fillRect(startX - 2 * dpr, 0, 4 * dpr, height);
        ctx.fillRect(endX - 2 * dpr, 0, 4 * dpr, height);
      } else if (capture.status === 'monitoring' || capture.status === 'recording') {
        // Live scrolling view of the recent past
        drawWaveform(ctx, capture.readLiveWindow(liveWindowS), 1, width, height, dpr);

        // Level meter bar along the bottom
        ctx.fillStyle = capture.level > 0.95 ? '#ff4b3e' : '#00e0c6';
        ctx.fillRect(0, height - 6 * dpr, capture.level * width, 6 * dpr);

        if (capture.status === 'recording') {
          ctx.fillStyle = '#ff4b3e';
          ctx.beginPath();
          ctx.arc(width - 20 * dpr, 20 * dpr, 8 * dpr, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        // Idle: flat line
        ctx.strokeStyle = '#00e0c6';
        ctx.lineWidth = 2 * dpr;
        ctx.beginPath();
        ctx.moveTo(0, midY);
        ctx.lineTo(width, midY);
        ctx.stroke();
      }
    }

    return () => cancelAnimationFrame(animationFrame);
  });

  function drawWaveform(
    ctx: CanvasRenderingContext2D,
    samples: Float32Array,
    gain: number,
    width: number,
    height: number,
    dpr: number
  ) {
    const midY = height / 2;
    const samplesPerPixel = samples.length / width;

    ctx.strokeStyle = '#00e0c6';
    ctx.lineWidth = dpr;
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
</script>

<canvas bind:this={canvasEl} class="h-40 min-w-0 flex-1 rounded-lg"></canvas>
