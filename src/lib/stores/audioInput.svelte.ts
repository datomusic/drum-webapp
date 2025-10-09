'use runes';

import { createLogger } from '$lib/utils/logger';

const logger = createLogger('AudioInput');

interface AudioInputState {
  /**
   * List of available audio input devices
   */
  devices: MediaDeviceInfo[];

  /**
   * Currently selected audio input device ID
   */
  selectedDeviceId: string | null;

  /**
   * Currently selected device info
   */
  selectedDevice: MediaDeviceInfo | null;

  /**
   * Permission state for microphone access
   */
  permissionState: PermissionState | null;

  /**
   * Whether we're currently checking for devices
   */
  isLoading: boolean;

  /**
   * Error message if something went wrong
   */
  error: string | null;
}

const initialState: AudioInputState = {
  devices: [],
  selectedDeviceId: null,
  selectedDevice: null,
  permissionState: null,
  isLoading: false,
  error: null
};

// Create reactive state using Svelte 5 runes
let audioInputState = $state<AudioInputState>(initialState);

// --- Start of Internal State Update Actions ---

function _setDevices(devices: MediaDeviceInfo[]) {
  audioInputState.devices = devices;

  // Auto-select default device if none selected and devices available
  if (!audioInputState.selectedDeviceId && devices.length > 0) {
    const defaultDevice = devices.find(d => d.deviceId === 'default') || devices[0];
    _setSelectedDevice(defaultDevice.deviceId);
  }
}

function _setSelectedDevice(deviceId: string) {
  audioInputState.selectedDeviceId = deviceId;
  audioInputState.selectedDevice =
    audioInputState.devices.find(d => d.deviceId === deviceId) || null;
  audioInputState.error = null;
  logger.info(`Selected audio input: ${audioInputState.selectedDevice?.label || 'Unknown'}`);
}

function _setPermissionState(state: PermissionState) {
  audioInputState.permissionState = state;
}

function _setLoading(isLoading: boolean) {
  audioInputState.isLoading = isLoading;
}

function _setError(errorMessage: string) {
  audioInputState.error = errorMessage;
  audioInputState.isLoading = false;
}

function _clearError() {
  audioInputState.error = null;
}

// --- End of Internal State Update Actions ---

/**
 * Check if browser supports audio recording
 */
function isAudioInputSupported(): boolean {
  return !!(
    navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === 'function' &&
    typeof navigator.mediaDevices.enumerateDevices === 'function'
  );
}

/**
 * Enumerate available audio input devices
 */
async function enumerateDevices(): Promise<void> {
  if (!isAudioInputSupported()) {
    _setError('Audio recording is not supported in this browser');
    return;
  }

  _setLoading(true);
  _clearError();

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioInputs = devices.filter(device => device.kind === 'audioinput');

    logger.debug(`Found ${audioInputs.length} audio input devices`);
    _setDevices(audioInputs);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to enumerate devices';
    logger.error(`Failed to enumerate audio devices: ${errorMessage}`);
    _setError(errorMessage);
  } finally {
    _setLoading(false);
  }
}

/**
 * Request microphone permission and enumerate devices
 * This will trigger browser permission prompt if not already granted
 */
async function requestPermission(): Promise<boolean> {
  if (!isAudioInputSupported()) {
    _setError('Audio recording is not supported in this browser');
    return false;
  }

  _setLoading(true);
  _clearError();

  try {
    // Request access to trigger permission prompt
    // We'll immediately release the stream after getting permission
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    // Release the stream immediately
    stream.getTracks().forEach(track => track.stop());

    logger.info('Microphone permission granted');
    _setPermissionState('granted');

    // Now enumerate devices (with permission granted, we'll see device labels)
    await enumerateDevices();

    return true;

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Permission denied';
    logger.error(`Microphone permission denied: ${errorMessage}`);
    _setError('Microphone access denied. Please allow microphone access in your browser settings.');
    _setPermissionState('denied');
    return false;

  } finally {
    _setLoading(false);
  }
}

/**
 * Select a specific audio input device
 */
function selectDevice(deviceId: string): void {
  const device = audioInputState.devices.find(d => d.deviceId === deviceId);

  if (!device) {
    logger.warn(`Device not found: ${deviceId}`);
    _setError('Selected device not found');
    return;
  }

  _setSelectedDevice(deviceId);
}

/**
 * Check current permission state without triggering a prompt
 */
async function checkPermissionState(): Promise<void> {
  if (!navigator.permissions || !navigator.permissions.query) {
    logger.debug('Permissions API not supported');
    return;
  }

  try {
    // @ts-ignore - TypeScript doesn't have full types for all permission names
    const permissionStatus = await navigator.permissions.query({ name: 'microphone' });
    _setPermissionState(permissionStatus.state);

    // Listen for permission changes
    permissionStatus.onchange = () => {
      logger.debug(`Microphone permission changed to: ${permissionStatus.state}`);
      _setPermissionState(permissionStatus.state);

      // Re-enumerate devices when permission changes
      if (permissionStatus.state === 'granted') {
        enumerateDevices();
      }
    };

    logger.debug(`Microphone permission state: ${permissionStatus.state}`);

  } catch (error) {
    logger.debug('Could not query microphone permission');
  }
}

/**
 * Refresh device list
 * Useful when devices are added/removed
 */
async function refreshDevices(): Promise<void> {
  await enumerateDevices();
}

/**
 * Initialize the audio input system
 * Call this on app startup
 */
async function initialize(): Promise<void> {
  if (!isAudioInputSupported()) {
    logger.warn('Audio input not supported in this browser');
    return;
  }

  // Check permission state
  await checkPermissionState();

  // Enumerate devices (may only show IDs without permission)
  await enumerateDevices();

  // Listen for device changes
  if (navigator.mediaDevices.ondevicechange !== undefined) {
    navigator.mediaDevices.ondevicechange = () => {
      logger.debug('Audio devices changed, refreshing list');
      refreshDevices();
    };
  }
}

/**
 * Get a derived property for whether we have permission
 */
function hasPermission(): boolean {
  return audioInputState.permissionState === 'granted';
}

/**
 * Get a derived property for whether we have devices available
 */
function hasDevices(): boolean {
  return audioInputState.devices.length > 0;
}

export {
  audioInputState,
  initialize,
  requestPermission,
  enumerateDevices,
  selectDevice,
  refreshDevices,
  isAudioInputSupported,
  hasPermission,
  hasDevices
};
