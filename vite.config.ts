import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

// Pin the fs allow root to this directory instead of relying on Vite's
// upward workspace-root search, which can climb past a git worktree
// (e.g. one nested under .claude/worktrees/) into an unrelated ancestor.
const projectRoot = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	server: {
		fs: {
			allow: [projectRoot]
		}
	}
});
