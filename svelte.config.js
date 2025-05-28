// import adapter from '@sveltejs/adapter-auto';
import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://svelte.dev/docs/kit/integrations
	// for more information about preprocessors
	preprocess: vitePreprocess(),

	kit: {
		// adapter-auto only supports some environments, see https://svelte.dev/docs/kit/adapter-auto for a list.
		// If your environment is not supported, or you settled on a specific environment, switch out the adapter.
		// See https://svelte.dev/docs/kit/adapters for more information about adapters.
		adapter: adapter({
			// default options are shown. On some platforms
			// these options are set automatically — see below
			pages: 'build',
			assets: 'build',
			// This 'base' option for adapter-static is for where the adapter places assets.
			// It's often redundant if kit.paths.base is set, but can be kept for clarity.
			// It should match kit.paths.base.
			fallback: undefined,
			precompress: false,
			strict: true
		}),
		// This is the crucial part for SvelteKit's internal path resolution
		paths: {
			base: '/playground/drum-webapp'
		}
	}
};

export default config;
