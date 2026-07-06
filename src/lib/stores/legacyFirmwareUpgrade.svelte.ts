'use runes';

// Ensure the datoFeatures console API object exists before we extend it
import '$lib/stores/featureFlags.svelte';
import { createLogger } from '$lib/utils/logger';

const logger = createLogger('LegacyFirmwareUpgrade');

interface LegacyFirmwareUpgradeState {
  open: boolean;
  // Set when the user dismisses the prompt, so it doesn't reappear for the
  // same connection. Cleared on disconnect by the component.
  dismissed: boolean;
  // Set via the datoFeatures console API to test the flow on any device
  forced: boolean;
}

const legacyUpgradeState = $state<LegacyFirmwareUpgradeState>({
  open: false,
  dismissed: false,
  forced: false
});

function openLegacyFirmwareUpgrade(forced = false) {
  legacyUpgradeState.open = true;
  legacyUpgradeState.forced = forced;
}

function dismissLegacyFirmwareUpgrade() {
  legacyUpgradeState.open = false;
  legacyUpgradeState.dismissed = true;
  legacyUpgradeState.forced = false;
}

function resetLegacyFirmwareUpgrade() {
  legacyUpgradeState.open = false;
  legacyUpgradeState.dismissed = false;
  legacyUpgradeState.forced = false;
}

// Console API: datoFeatures.showLegacyFirmwareUpgrade()
// Opens the legacy (pre-v1.0.0) firmware upgrade flow regardless of the
// connected device's firmware version, for testing on newer devices.
if (typeof window !== 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const api = ((window as any).datoFeatures ??= {});
  api.showLegacyFirmwareUpgrade = () => {
    logger.info('Legacy firmware upgrade flow opened via datoFeatures console API');
    openLegacyFirmwareUpgrade(true);
  };
}

export {
  legacyUpgradeState,
  openLegacyFirmwareUpgrade,
  dismissLegacyFirmwareUpgrade,
  resetLegacyFirmwareUpgrade
};
