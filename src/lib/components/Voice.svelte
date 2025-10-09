<script lang="ts">
  import { midiState, playNote } from '$lib/stores/midi.svelte';
  import { colorFilters } from '$lib/stores/colorFilters';
  import { isDraggingOverWindow } from '$lib/stores/dragDropStore';
  import { sampleUploadStore, uploadQueue } from '$lib/stores/sampleUpload';
  import { isAudioFile } from '$lib/services/audioProcessor';
  import { recordAudio, isRecordingSupported, type RecordingProgress } from '$lib/services/audioRecorder';
  import { audioInputState, requestPermission } from '$lib/stores/audioInput.svelte';
  import { createLogger } from '$lib/utils/logger';

  const logger = createLogger('Voice');

  // This component represents the "Voice" settings for a sample slot.
  // It displays an icon indicating its purpose and acts as a drop target for audio files.

  let isDragOver = $state(false);
  let uploadStatus = $state<'idle' | 'uploading' | 'success' | 'error'>('idle');
  let uploadError = $state<string | null>(null);

  // Recording state
  let recordingStatus = $state<'idle' | 'requesting-permission' | 'waiting' | 'recording' | 'processing' | 'error'>('idle');
  let recordingProgress = $state<number>(0);
  let recordingError = $state<string | null>(null);

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

  // Check if this slot is currently being uploaded
  let isUploadingThisSlot = $derived(
    $uploadQueue.some(item =>
      item.targetSlot === midiNoteNumber &&
      (item.status === 'processing' || item.status === 'uploading')
    )
  );

  // Get upload progress for this slot
  let uploadProgress = $derived(
    $uploadQueue.find(item =>
      item.targetSlot === midiNoteNumber &&
      (item.status === 'processing' || item.status === 'uploading')
    )?.progress || 0
  );

  // Reactive statement to determine the background style
  let backgroundStyle = $derived(
    isDragOver
      ? '' // When dragging over, let Tailwind class 'bg-blue-100' handle background
      : recordingStatus === 'recording' || recordingStatus === 'processing'
      ? 'background-color: #fef3c7;' // Yellow tint while recording
      : recordingStatus === 'error'
      ? 'background-color: #fee2e2;' // Red tint for error
      : uploadStatus === 'success'
      ? 'background-color: #d1fae5;' // Green tint for success
      : uploadStatus === 'error'
      ? 'background-color: #fee2e2;' // Red tint for error
      : isUploadingThisSlot
      ? 'background-color: #dbeafe;' // Blue tint while uploading
      : (color ? `background-color: ${color};` : 'background-color: #e5e7eb;')
  );

  // Reactive variable to generate the CSS filter style based on the colorFilters store
  let filterStyle = $derived(`
    filter:
      saturate(${$colorFilters.saturation})
      brightness(${$colorFilters.brightness})
      contrast(${$colorFilters.contrast});
  `);

  // Function to handle click event and play the MIDI note
  function handleClick() {
    playNote(midiNoteNumber);
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

  async function handleDrop(event: DragEvent) {
    event.preventDefault();
    isDragOver = false;
    uploadStatus = 'idle';
    uploadError = null;

    const files = event.dataTransfer?.files;
    if (!files || files.length === 0) {
      return;
    }

    // Take the first file only
    const file = files[0];

    // Validate audio file
    if (!isAudioFile(file)) {
      uploadStatus = 'error';
      uploadError = 'Not an audio file';
      logger.warn(`Rejected non-audio file: ${file.name}`);

      // Reset error after 3 seconds
      setTimeout(() => {
        uploadStatus = 'idle';
        uploadError = null;
      }, 3000);
      return;
    }

    // Check MIDI connection
    if (!midiState.isConnected) {
      uploadStatus = 'error';
      uploadError = 'MIDI not connected';
      logger.error('Cannot upload: MIDI device not connected');

      // Reset error after 3 seconds
      setTimeout(() => {
        uploadStatus = 'idle';
        uploadError = null;
      }, 3000);
      return;
    }

    try {
      uploadStatus = 'uploading';
      logger.info(`Uploading ${file.name} to slot ${midiNoteNumber}`);

      // Use quick upload (add to queue and start immediately)
      await sampleUploadStore.quickUpload(file, midiNoteNumber);

      uploadStatus = 'success';
      logger.info(`Successfully uploaded ${file.name} to slot ${midiNoteNumber}`);

      // Reset success indicator after 2 seconds
      setTimeout(() => {
        uploadStatus = 'idle';
      }, 2000);

    } catch (error) {
      uploadStatus = 'error';
      uploadError = error instanceof Error ? error.message : 'Upload failed';
      logger.error(`Upload failed: ${uploadError}`);

      // Reset error after 3 seconds
      setTimeout(() => {
        uploadStatus = 'idle';
        uploadError = null;
      }, 3000);
    }
  }

  // File input handler for browse button
  let fileInput: HTMLInputElement;

  function handleBrowseClick() {
    fileInput?.click();
  }

  async function handleFileSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = input.files;
    if (!files || files.length === 0) {
      return;
    }

    // Simulate drop event
    const file = files[0];
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);

    await handleDrop({
      preventDefault: () => {},
      dataTransfer
    } as DragEvent);

    // Reset input
    input.value = '';
  }

  // Recording functionality
  async function handleRecordClick() {
    // Check if recording is supported
    if (!isRecordingSupported()) {
      recordingStatus = 'error';
      recordingError = 'Recording not supported in this browser';
      logger.error('Recording not supported');

      // Reset error after 3 seconds
      setTimeout(() => {
        recordingStatus = 'idle';
        recordingError = null;
      }, 3000);
      return;
    }

    // Check MIDI connection
    if (!midiState.isConnected) {
      recordingStatus = 'error';
      recordingError = 'MIDI not connected';
      logger.error('Cannot record: MIDI device not connected');

      // Reset error after 3 seconds
      setTimeout(() => {
        recordingStatus = 'idle';
        recordingError = null;
      }, 3000);
      return;
    }

    try {
      recordingStatus = 'idle';
      recordingError = null;
      recordingProgress = 0;

      // Check if we have permission, request if needed
      if (!audioInputState.permissionState || audioInputState.permissionState !== 'granted') {
        recordingStatus = 'requesting-permission';
        logger.info('Requesting microphone permission...');

        const granted = await requestPermission();
        if (!granted) {
          recordingStatus = 'error';
          recordingError = 'Microphone permission denied';
          logger.error('Microphone permission denied');

          // Reset error after 3 seconds
          setTimeout(() => {
            recordingStatus = 'idle';
            recordingError = null;
          }, 3000);
          return;
        }
      }

      // Start recording
      logger.info(`Recording audio for slot ${midiNoteNumber}...`);

      const processedAudio = await recordAudio(
        {
          deviceId: audioInputState.selectedDeviceId || undefined
        },
        (progress: RecordingProgress) => {
          // Update recording status based on progress
          if (progress.stage === 'requesting') {
            recordingStatus = 'requesting-permission';
            recordingProgress = 0;
          } else if (progress.stage === 'waiting') {
            recordingStatus = 'waiting';
            recordingProgress = 0;
          } else if (progress.stage === 'recording') {
            recordingStatus = 'recording';
            recordingProgress = progress.percentage;
          } else if (progress.stage === 'processing') {
            recordingStatus = 'processing';
            recordingProgress = progress.percentage;
          }
        }
      );

      // Create a File object from the processed audio
      const blob = new Blob([processedAudio.pcmData], { type: 'audio/x-raw-pcm' });
      const file = new File([blob], processedAudio.originalFileName, { type: 'audio/x-raw-pcm' });

      // Upload via existing upload system
      uploadStatus = 'uploading';
      logger.info(`Uploading recorded audio to slot ${midiNoteNumber}`);

      await sampleUploadStore.quickUpload(file, midiNoteNumber);

      // Success
      recordingStatus = 'idle';
      uploadStatus = 'success';
      logger.info(`Successfully uploaded recording to slot ${midiNoteNumber}`);

      // Reset success indicator after 2 seconds
      setTimeout(() => {
        uploadStatus = 'idle';
      }, 2000);

    } catch (error) {
      recordingStatus = 'error';
      recordingError = error instanceof Error ? error.message : 'Recording failed';
      logger.error(`Recording failed: ${recordingError}`);

      // Reset error after 3 seconds
      setTimeout(() => {
        recordingStatus = 'idle';
        recordingError = null;
      }, 3000);
    }
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

    <!-- Recording progress indicator -->
    {#if recordingStatus === 'waiting' || recordingStatus === 'recording' || recordingStatus === 'processing'}
      <div class="absolute inset-0 flex items-center justify-center bg-yellow-500 bg-opacity-70 rounded-lg">
        <div class="text-white text-xs font-bold">
          {#if recordingStatus === 'waiting'}
            🎧 Waiting...
          {:else if recordingStatus === 'recording'}
            🎤 {Math.round(recordingProgress)}%
          {:else}
            ⚙️ {Math.round(recordingProgress)}%
          {/if}
        </div>
      </div>
    {/if}

    <!-- Upload progress indicator -->
    {#if isUploadingThisSlot}
      <div class="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 rounded-lg">
        <div class="text-white text-xs font-bold">
          {Math.round(uploadProgress)}%
        </div>
      </div>
    {/if}

    <!-- Upload status indicator -->
    {#if uploadStatus === 'success'}
      <div class="absolute inset-0 flex items-center justify-center bg-green-500 bg-opacity-70 rounded-lg">
        <div class="text-white text-2xl">✓</div>
      </div>
    {:else if uploadStatus === 'error' && uploadError}
      <div class="absolute inset-0 flex items-center justify-center bg-red-500 bg-opacity-70 rounded-lg">
        <div class="text-white text-xs text-center p-1">{uploadError}</div>
      </div>
    {:else if recordingStatus === 'error' && recordingError}
      <div class="absolute inset-0 flex items-center justify-center bg-red-500 bg-opacity-70 rounded-lg">
        <div class="text-white text-xs text-center p-1">{recordingError}</div>
      </div>
    {/if}
  </button>

  <div class="flex gap-1">
    <button
      class="w-8 h-8 bg-red-500 text-white rounded hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
      aria-label="Record"
      onclick={handleRecordClick}
      disabled={recordingStatus !== 'idle' || uploadStatus !== 'idle'}
      title={recordingStatus !== 'idle' ? 'Recording...' : 'Record 1 second of audio'}
    >
      {#if recordingStatus === 'recording'}
        ⏺
      {:else}
        ●
      {/if}
    </button>
    <button
      class="w-8 h-8 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors flex items-center justify-center text-xs cursor-pointer"
      aria-label="Browse"
      onclick={handleBrowseClick}
      title="Browse for audio file"
    >
      ...
    </button>
  </div>

  <!-- Hidden file input -->
  <input
    bind:this={fileInput}
    type="file"
    accept="audio/*,.wav,.mp3,.ogg,.flac,.m4a,.aac"
    style="display: none;"
    onchange={handleFileSelect}
  />
</div>

<style>

</style>
