import { setupI18n } from '../i18n';
import type { LayoutLoad } from './$types';

export const prerender = true;

// This load function runs before the layout and page components are rendered.
// It ensures that svelte-i18n is initialized and the locale is set.
export const load: LayoutLoad = async () => {
  await setupI18n();
};
