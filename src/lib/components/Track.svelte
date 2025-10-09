<script lang="ts">
  import { run } from 'svelte/legacy';

  import { tweened } from 'svelte/motion';
  import { cubicOut } from 'svelte/easing';
  import SampleButton from './SampleButton.svelte';
  import Voice from './Voice.svelte';
  import { selectedSampleMidiNote } from '$lib/stores/midi'; // Import selectedSampleMidiNote

  interface Props {
    samples: Array<{ color: string; midiNoteNumber: number }>;
    trackIndex: number;
  }

  let { samples, trackIndex }: Props = $props();

  // Initialize selectedSampleIndex to the middle, or the first if samples are few
  let selectedSampleIndex = $state(Math.floor(samples.length / 2));
  let selectedVoiceColor = $derived(samples[selectedSampleIndex]?.color);
  // ADDED: Get the MIDI note number of the currently selected voice
  let selectedVoiceMidiNote = $derived(samples[selectedSampleIndex]?.midiNoteNumber);

  const voiceIcons = [
    'pad_hat.svg',
    'pad_clap.svg',
    'pad_snare.svg',
    'pad_kick.svg',
  ];
  let currentTrackIcon = $derived(voiceIcons[trackIndex % voiceIcons.length]);

  // Configuration for layout (based on sm: Tailwind classes)
  // sm:w-20 for SampleButton/Voice -> 5rem = 80px (assuming 1rem = 16px)
  // sm:gap-x-4 for gaps -> 1rem = 16px
  const buttonWidthPx = 80;
  const gapPx = 16;
  const itemSlotWidthPx = buttonWidthPx + gapPx; // Effective width of a button slot including its gap

  let containerWidthPx = $state(0); // Bound to the track-container's clientWidth

  const stripTranslateX = tweened(0, {
    duration: 350,
    easing: cubicOut,
  });

  // Reactive statement to update selectedSampleIndex based on selectedSampleMidiNote
  run(() => {
    if ($selectedSampleMidiNote !== null) {
      const incomingNoteIndex = samples.findIndex(
        sample => sample.midiNoteNumber === $selectedSampleMidiNote
      );
      if (incomingNoteIndex !== -1) {
        selectedSampleIndex = incomingNoteIndex;
      }
    }
  });

  // Reactive effect to update the translation when selectedSampleIndex or containerWidthPx changes
  run(() => {
    if (containerWidthPx > 0) {
      // Calculate the X position that would place the center of the selected button
      // at the center of the container.
      // The total offset to the start of the selected button is `selectedSampleIndex * itemSlotWidthPx`.
      // To center this button, its center (`buttonWidthPx / 2`) should align with `containerWidthPx / 2`.
      const targetX =
        containerWidthPx / 2 - selectedSampleIndex * itemSlotWidthPx - buttonWidthPx / 2;
      stripTranslateX.set(targetX);
    }
  });
</script>

<div
  class="track-container relative flex items-center w-full h-40"
  bind:clientWidth={containerWidthPx}
>
  <div
    class="button-strip absolute flex bg-white"
    style="transform: translateX({$stripTranslateX}px); top: 0px; will-change: transform; white-space: nowrap;"
  >
    {#each samples as sample, i (sample.midiNoteNumber)}
      <div
        class="sample-item-wrapper flex-shrink-0"
        style="width: {buttonWidthPx}px; margin-right: { gapPx/2 }px; margin-left: { gapPx/2 }px;"
      >
        <SampleButton
          color={sample.color}
          midiNoteNumber={sample.midiNoteNumber}
        />
      </div>
    {/each}
  </div>

  <div class="voice-overlay-container z-10 absolute top-10 left-1/2 -translate-x-1/2 -translate-y-1/2">
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
  /* Minimal styles needed as Tailwind and inline styles handle most of it.
     will-change and white-space are added for the button strip for performance and layout.
     The h-36 on track-container ensures enough vertical space for Voice component with buttons.
     SampleButton and Voice components are expected to be sm:w-20 sm:h-20 (80px).
   */
</style>
