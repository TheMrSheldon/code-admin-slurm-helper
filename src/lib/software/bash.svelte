<script module lang="ts">
	import { Terminal } from '@lucide/svelte';
	import type { SoftwareDefinition } from './types';

	export const bash: SoftwareDefinition = {
		id: 'bash',
		label: 'Bash Shell',
		icon: Terminal,
		description: 'Open an interactive shell',
		defaultOptions: {
			command: '',
			interactive: true
		},
		buildCommand(base, { command, interactive }, { debugMode }) {
			const dbg = debugMode ? 'set -x; ' : '';
			const prefix = interactive ? '--pty bash' : 'bash';
			if (command) return `${base} \\\n\t${prefix} -c '${dbg}${command}'`;
			if (debugMode) return `${base} \\\n\t--pty bash -c '${dbg}'`;
			return `${base} \\\n\t${prefix}`;
		}
	};
</script>

<script lang="ts">
	let { options }: { options: { command: string; interactive: boolean } } = $props();
</script>

<div class="input-group grid-cols-[auto_1fr]">
	<div class="ig-cell justify-start preset-tonal">Command</div>
	<input
		class="ig-input font-mono text-sm"
		type="text"
		bind:value={options.command}
		placeholder="Leave empty for an interactive shell"
	/>

	<div class="ig-cell justify-start preset-tonal">Options</div>
	<div class="ig-cell">
		<label class="flex cursor-pointer items-center gap-2">
			<input class="checkbox" type="checkbox" bind:checked={options.interactive} />
			<span>Allocate a pseudo-terminal (--pty)</span>
		</label>
	</div>
</div>
