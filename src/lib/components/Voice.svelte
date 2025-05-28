<script lang="ts">
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
  export let imageSrc: string; // Re-adding this prop

  // Reactive statement to determine the background style
  $: backgroundStyle = color ? `background-color: ${color};` : 'background-color: #e5e7eb;'; // Tailwind's bg-gray-200
</script>

<div class="
    voice-component
    w-20 h-20
    rounded-lg
    flex items-center justify-center
    shadow-sm
    hover:shadow-md
    transition-all duration-150 ease-in-out
    cursor-pointer
"
style="{backgroundStyle}"
>
  <img src={imageSrc} alt="Voice Settings" class="w-16 h-16" />
</div>

<style>
  /* No specific styles needed here, Tailwind handles most of it. */
</style>
