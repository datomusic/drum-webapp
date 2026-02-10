<script lang="ts">
  import { midiNoteState, playNote } from "$lib/stores/midi.svelte";
  import { colorFilters } from "$lib/stores/colorFilters";

  // MIDI display offset: converts MIDI note 30-61 to display index 1-32
  const MIDI_DISPLAY_OFFSET = 30;

  interface Props {
    /**
     * The color of the button, e.g., '#FF0000' or 'red'.
     */
    color: string;
    /**
     * The MIDI note number to display on the button.
     */
    midiNoteNumber: number;
  }

  let { color, midiNoteNumber }: Props = $props();

  // Calculate 1-based display index from MIDI note number
  let displayIndex = $derived(midiNoteNumber - MIDI_DISPLAY_OFFSET + 1);

  // Reactive variable to determine if this button is currently active
  let isActive = $derived(midiNoteState.active === midiNoteNumber);

  // Reactive variable to generate the CSS filter style based on the colorFilters store
  let filterStyle = $derived(`
    filter:
      saturate(${$colorFilters.saturation})
      brightness(${$colorFilters.brightness})
      contrast(${$colorFilters.contrast});
  `);

  function handleClick() {
    // Call the centralized playNote function
    playNote(midiNoteNumber);
  }
</script>

<button
  class="
    rounded-full
    text-white text-lg
    cursor-pointer
    transition-all duration-150 ease-in-out
    focus:outline-none
  "
  style="width: var(--sample-button-size); height: var(--sample-button-size); background-color: {color}; {filterStyle}"
  onclick={handleClick}
>
  {displayIndex}
</button>

<style>
  /* No specific styles needed here, Tailwind handles most of it. */
  /* The background-color is set via the style attribute directly. */
  /* The 'ring' and 'shadow' classes are applied conditionally by Tailwind. */
</style>
