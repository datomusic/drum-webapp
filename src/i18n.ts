import { register, init, getLocaleFromNavigator } from 'svelte-i18n';

// Register translation files for different locales
register('en', () => import('./locales/en.json'));
register('es', () => import('./locales/es.json'));
register('de', () => import('./locales/de.json')); // Register German locale
register('nl', () => import('./locales/nl.json')); // Register Dutch locale

// Initialize svelte-i18n
init({
  fallbackLocale: 'en', // Fallback to English if the detected locale is not available
  initialLocale: getLocaleFromNavigator(), // Try to use the user's browser locale
});
