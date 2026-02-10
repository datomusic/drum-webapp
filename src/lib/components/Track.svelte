<script lang="ts">
  import { tweened } from "svelte/motion";
  import { cubicOut } from "svelte/easing";
  import SampleButton from "./SampleButton.svelte";
  import Voice from "./Voice.svelte";
  import { midiNoteState } from "$lib/stores/midi.svelte";
  import { onMount } from "svelte";

  interface Props {
    samples: Array<{ color: string; midiNoteNumber: number }>;
    trackIndex: number;
  }

  let { samples, trackIndex }: Props = $props();

  // Initialize selectedSampleIndex to the middle, or the first if samples are few
  let selectedSampleIndex = $state(Math.floor(samples.length / 2));
  let selectedVoiceColor = $derived(samples[selectedSampleIndex]?.color);
  let selectedVoiceMidiNote = $derived(
    samples[selectedSampleIndex]?.midiNoteNumber,
  );

  const voiceIcons = [
    "pad_kick.svg",
    "pad_snare.svg",
    "pad_clap.svg",
    "pad_hat.svg",
  ];
  let currentTrackIcon = $derived(voiceIcons[trackIndex % voiceIcons.length]);

  // Read sizing from CSS custom properties — single source of truth
  let slotWidth = $state(80); // fallback, overwritten on mount
  let buttonSize = $state(64);

  onMount(() => {
    const styles = getComputedStyle(document.documentElement);
    buttonSize =
      parseFloat(styles.getPropertyValue("--sample-button-size")) || 64;
    const gap = parseFloat(styles.getPropertyValue("--sample-gap")) || 16;
    slotWidth = buttonSize + gap;
  });

  let containerWidthPx = $state(0);

  const stripTranslateX = tweened(0, {
    duration: 350,
    easing: cubicOut,
  });

  // Reactive effect to update selectedSampleIndex based on midiNoteState.selectedSample
  $effect(() => {
    if (midiNoteState.selectedSample !== null) {
      const incomingNoteIndex = samples.findIndex(
        (sample) => sample.midiNoteNumber === midiNoteState.selectedSample,
      );
      if (incomingNoteIndex !== -1) {
        selectedSampleIndex = incomingNoteIndex;
      }
    }
  });

  // Track previous values to distinguish sample-selection changes from resize changes
  let prevSelectedSampleIndex = selectedSampleIndex;
  let prevContainerWidthPx = 0;

  // Reactive effect to update the translation when selectedSampleIndex or containerWidthPx changes
  $effect(() => {
    if (containerWidthPx > 0 && slotWidth > 0) {
      const targetX =
        containerWidthPx / 2 - selectedSampleIndex * slotWidth - slotWidth / 2;

      // Animate only when the selected sample changed; jump instantly on resize
      const sampleChanged = selectedSampleIndex !== prevSelectedSampleIndex;
      const isResize = containerWidthPx !== prevContainerWidthPx;

      if (sampleChanged) {
        stripTranslateX.set(targetX); // smooth 350ms tween
      } else {
        stripTranslateX.set(targetX, { duration: 0 }); // instant reposition
      }

      prevSelectedSampleIndex = selectedSampleIndex;
      prevContainerWidthPx = containerWidthPx;
    }
  });
</script>

<div class="track" bind:clientWidth={containerWidthPx}>
  <!-- Button strip: absolutely positioned so it can slide offscreen -->
  <div
    class="button-strip"
    style="transform: translateX({$stripTranslateX}px) translateY(-50%);"
  >
    {#each samples as sample, i (sample.midiNoteNumber)}
      <div class="sample-slot">
        <SampleButton
          color={sample.color}
          midiNoteNumber={sample.midiNoteNumber}
        />
      </div>
    {/each}
  </div>

  <!-- Voice overlay: in normal flow, defines the track's height -->
  <div class="voice-container">
    {#if samples[selectedSampleIndex]}
      <Voice
        color={selectedVoiceColor}
        imageSrc={currentTrackIcon}
        midiNoteNumber={selectedVoiceMidiNote}
      />
    {/if}
  </div>
</div>

<style>
  .track {
    position: relative;
    width: 100%;
    display: grid;
    grid-template-columns: 1fr;
    grid-template-rows: auto;
    justify-items: center;
    margin-bottom: var(--track-gap);
  }

  .button-strip {
    position: absolute;
    left: 0;
    /* Vertically center the strip on the Voice's main button */
    top: calc(var(--voice-size) / 2);
    display: flex;
    white-space: nowrap;
    will-change: transform;
    background: white;
  }

  .sample-slot {
    flex-shrink: 0;
    width: var(--sample-button-size);
    margin-left: calc(var(--sample-gap) / 2);
    margin-right: calc(var(--sample-gap) / 2);
  }

  .voice-container {
    position: relative;
    z-index: 10;
    /* Grid places this in normal flow — its intrinsic height defines the track height */
  }
</style>
