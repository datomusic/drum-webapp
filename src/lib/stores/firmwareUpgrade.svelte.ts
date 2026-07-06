'use runes';

// Ensure the datoFeatures console API object exists before we extend it
import '$lib/stores/featureFlags.svelte';
import { createLogger } from '$lib/utils/logger';

const logger = createLogger('FirmwareUpgrade');

interface FirmwareUpgradeState {
  open: boolean;
  // Set when the user dismisses the prompt, so it doesn't reappear for the
  // same connection. Cleared on disconnect by the component.
  dismissed: boolean;
  // Set via the datoFeatures console API to test the flow on any device
  forced: boolean;
}

const firmwareUpgradeState = $state<FirmwareUpgradeState>({
  open: false,
  dismissed: false,
  forced: false
});

function openFirmwareUpgrade(forced = false) {
  firmwareUpgradeState.open = true;
  firmwareUpgradeState.forced = forced;
}

function dismissFirmwareUpgrade() {
  firmwareUpgradeState.open = false;
  firmwareUpgradeState.dismissed = true;
  firmwareUpgradeState.forced = false;
}

function resetFirmwareUpgrade() {
  firmwareUpgradeState.open = false;
  firmwareUpgradeState.dismissed = false;
  firmwareUpgradeState.forced = false;
}

// Console API: datoFeatures.showFirmwareUpgrade()
// Opens the SysEx firmware upgrade flow regardless of whether the connected
// device already runs the latest firmware, for testing.
if (typeof window !== 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const api = ((window as any).datoFeatures ??= {});
  api.showFirmwareUpgrade = () => {
    logger.info('Firmware upgrade flow opened via datoFeatures console API');
    openFirmwareUpgrade(true);
  };
}

export {
  firmwareUpgradeState,
  openFirmwareUpgrade,
  dismissFirmwareUpgrade,
  resetFirmwareUpgrade
};
