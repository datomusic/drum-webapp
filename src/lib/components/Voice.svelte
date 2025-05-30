<script lang="ts">
  import { midiStore } from '$lib/stores/midi';
  import { colorFilters } from '$lib/stores/colorFilters'; // Import colorFilters store

  // This component represents the "Voice" settings for a sample slot.
  // It displays an icon indicating its purpose.

  /**
   * Optional color to apply to the voice component's background.
   * If undefined, a default gray background will be used.
   */
  export let color: string | undefined = undefined;

  /**
   * The source path for the icon image to display within the voice component.
   */
  export let imageSrc: string;

  /**
   * The MIDI note number associated with this voice.
   * This prop is used to play the note when the voice is clicked.
   */
  export let midiNoteNumber: number;

  // Reactive statement to determine the background style
  $: backgroundStyle = color ? `background-color: ${color};` : 'background-color: #e5e7eb;'; // Tailwind's bg-gray-200

  // Reactive variable to generate the CSS filter style based on the colorFilters store
  $: filterStyle = `
    filter:
      saturate(${$colorFilters.saturation})
      brightness(${$colorFilters.brightness})
      contrast(${$colorFilters.contrast});
  `;

  // Function to handle click event and play the MIDI note
  function handleClick() {
    midiStore.playNote(midiNoteNumber);
  }
</script>

<button class="
    voice-component
    w-20 h-20
    rounded-lg
    flex items-center justify-center
    shadow-sm
    hover:shadow-md
    transition-all duration-150 ease-in-out
    cursor-pointer
"
style="{backgroundStyle} {filterStyle}"
on:click={handleClick}
>
  <img src={imageSrc} alt="Voice" class="w-16 h-16" />
</button>

<style>
  /* No specific styles needed here, Tailwind handles most of it. */
</style>
