import { register, init, getLocaleFromNavigator } from 'svelte-i18n';

// Register translation files for different locales
register('en', () => import('./locales/en.json'));
register('de', () => import('./locales/de.json')); // Register German locale
register('nl', () => import('./locales/nl.json')); // Register Dutch locale

// Export an async function to initialize svelte-i18n
export async function setupI18n() {
  const navigatorLocale = getLocaleFromNavigator();
  // Normalize the navigator locale to its base language code (e.g., 'en-GB' -> 'en')
  // This ensures that if a specific variant is detected, we still try to match our base registered locales.
  const baseLocale = navigatorLocale ? navigatorLocale.split('-')[0] : 'en';

  await init({
    // Try to use the base locale first, then fallback to 'en'
    initialLocale: baseLocale,
    fallbackLocale: 'en',
  });
}
