<script lang="ts">
  import { midiStore } from '$lib/stores/midi';
  import { colorFilters } from '$lib/stores/colorFilters'; // Import colorFilters store
  import { isDraggingOverWindow } from '$lib/stores/dragDropStore'; // Import the global drag state

  // This component represents the "Voice" settings for a sample slot.
  // It displays an icon indicating its purpose and acts as a drop target for audio files.

  let isDragOver = $state(false); // Reactive variable to track drag-over state

  

  

  
  interface Props {
    /**
   * Optional color to apply to the voice component's background.
   * If undefined, a default gray background will be used.
   */
    color?: string | undefined;
    /**
   * The source path for the icon image to display within the voice component.
   */
    imageSrc: string;
    /**
   * The MIDI note number associated with this voice.
   * This prop is used to play the note when the voice is clicked.
   */
    midiNoteNumber: number;
  }

  let { color = undefined, imageSrc, midiNoteNumber }: Props = $props();

  // Reactive statement to determine the background style
  let backgroundStyle = $derived(isDragOver
    ? '' // When dragging over, let Tailwind class 'bg-blue-100' handle background
    : (color ? `background-color: ${color};` : 'background-color: #e5e7eb;')); // Tailwind's bg-gray-200

  // Reactive variable to generate the CSS filter style based on the colorFilters store
  let filterStyle = $derived(`
    filter:
      saturate(${$colorFilters.saturation})
      brightness(${$colorFilters.brightness})
      contrast(${$colorFilters.contrast});
  `);

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

<div class="flex flex-col items-center gap-2">
  <button
    class="
      voice-component
      w-24 h-24
      rounded-lg
      flex items-center justify-center
      shadow-sm
      hover:shadow-md
      transition-all duration-150 ease-in-out
      cursor-pointer
      border-2 border-transparent
      relative
    "
    class:border-dashed={isDragOver}
    class:border-blue-500={isDragOver}
    class:bg-blue-100={isDragOver}
    class:z-[1000]={$isDraggingOverWindow}
    style="{backgroundStyle} {filterStyle}"
    onclick={handleClick}
    ondragover={handleDragOver}
    ondragleave={handleDragLeave}
    ondrop={handleDrop}
  >
    <img src={imageSrc} alt="Voice" class="w-20 h-20" />
  </button>

  <div class="flex gap-1">
    <button class="w-8 h-8 bg-red-500 text-white rounded hover:bg-red-600 transition-colors" aria-label="Record">
    </button>
    <button class="w-8 h-8 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors" aria-label="Browse">
    </button>
  </div>
</div>

<style>

</style>
