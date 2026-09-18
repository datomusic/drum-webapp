'use runes';

import { createLogger } from '$lib/utils/logger';

const logger = createLogger('FeatureFlags');

const STORAGE_KEY = 'dato-feature-flags';

interface FeatureFlags {
  sampleRecorder: boolean;
  legacyFirmwareUpgrade: boolean;
  sysexFirmwareUpgrade: boolean;
  /** Download the slot's sample from the device on pad selection (slow: ~1s, freezes the sequencer). When off, only the cached/factory sample is shown. */
  downloadOnSelect: boolean;
}

const defaults: FeatureFlags = {
  sampleRecorder: false,
  legacyFirmwareUpgrade: false,
  sysexFirmwareUpgrade: false,
  downloadOnSelect: false
};

function loadFlags(): FeatureFlags {
  if (typeof window === 'undefined') return { ...defaults };

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...defaults, ...JSON.parse(stored) };
    }
  } catch (error) {
    logger.warn(`Failed to load feature flags: ${error instanceof Error ? error.message : String(error)}`);
  }

  return { ...defaults };
}

const featureFlags = $state<FeatureFlags>(loadFlags());

function persist() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(featureFlags));
  } catch (error) {
    logger.warn(`Failed to persist feature flags: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function setFlag(name: keyof FeatureFlags, value: boolean) {
  featureFlags[name] = value;
  persist();
  logger.info(`Feature flag '${name}' set to ${value}`);
}

// Console API: datoFeatures.enable('sampleRecorder') / disable(...) / list()
if (typeof window !== 'undefined') {
  (window as any).datoFeatures = {
    enable: (name: keyof FeatureFlags) => setFlag(name, true),
    disable: (name: keyof FeatureFlags) => setFlag(name, false),
    list: () => ({ ...featureFlags })
  };
}

export { featureFlags, setFlag };
