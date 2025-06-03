<script lang="ts">
  import { createBubbler } from 'svelte/legacy';

  const bubble = createBubbler();
  import { midiStore, activeMidiNote } from '$lib/stores/midi'; // Import activeMidiNote
  import { colorFilters } from '$lib/stores/colorFilters'; // Import colorFilters store
  import { get } from 'svelte/store';

  

  
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

  // Reactive variable to determine if this button is currently active
  let isActive = $derived($activeMidiNote === midiNoteNumber);

  // Reactive variable to generate the CSS filter style based on the colorFilters store
  let filterStyle = $derived(`
    filter:
      saturate(${$colorFilters.saturation})
      brightness(${$colorFilters.brightness})
      contrast(${$colorFilters.contrast});
  `);

  function handleClick() {
    // Call the centralized playNote function from the midiStore
    midiStore.playNote(midiNoteNumber);
  }
</script>

<button
  class="
    w-16 h-16
    rounded-full
    text-white text-lg
    cursor-pointer
    transition-all duration-150 ease-in-out
    focus:outline-none
  "
  style="background-color: {color}; {filterStyle}"
  onclick={handleClick}
  onkeydown={bubble('keydown')}
>
  {midiNoteNumber}
</button>

<style>
  /* No specific styles needed here, Tailwind handles most of it. */
  /* The background-color is set via the style attribute directly. */
  /* The 'ring' and 'shadow' classes are applied conditionally by Tailwind. */
</style>
