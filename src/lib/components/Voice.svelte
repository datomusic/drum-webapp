<script lang="ts">
  import { midiStore } from '$lib/stores/midi';
  import { colorFilters } from '$lib/stores/colorFilters'; // Import colorFilters store

  // This component represents the "Voice" settings for a sample slot.
  // It displays an icon indicating its purpose and acts as a drop target for audio files.

  let isDragOver = false; // Reactive variable to track drag-over state

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
  $: backgroundStyle = isDragOver
    ? '' // When dragging over, let Tailwind class 'bg-blue-100' handle background
    : (color ? `background-color: ${color};` : 'background-color: #e5e7eb;'); // Tailwind's bg-gray-200

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

  // Drag and drop event handlers
  function handleDragOver(event: DragEvent) {
    event.preventDefault(); // Necessary to allow dropping
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy'; // Show a copy icon
    }
    isDragOver = true;
  }

  function handleDragLeave(event: DragEvent) {
    event.preventDefault();
    isDragOver = false;
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    isDragOver = false;
    // File processing logic will be added here in a future step
    console.log('Files dropped:', event.dataTransfer?.files);
  }
</script>

<button
  class="
    voice-component
    w-20 h-20
    rounded-lg
    flex items-center justify-center
    shadow-sm
    hover:shadow-md
    transition-all duration-150 ease-in-out
    cursor-pointer
    border-2 border-transparent
  "
  class:border-dashed={isDragOver}
  class:border-blue-500={isDragOver}
  class:bg-blue-100={isDragOver}
  style="{backgroundStyle} {filterStyle}"
  on:click={handleClick}
  on:dragover={handleDragOver}
  on:dragleave={handleDragLeave}
  on:drop={handleDrop}
>
  <img src={imageSrc} alt="Voice" class="w-16 h-16" />
</button>

<style>

</style>
