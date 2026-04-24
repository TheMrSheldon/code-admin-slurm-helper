<script module lang="ts">
	import { NotebookText } from '@lucide/svelte';
	import type { SoftwareDefinition } from './types';

	export const jupyter: SoftwareDefinition = {
		id: 'jupyter',
		label: 'Jupyter Lab',
		icon: NotebookText,
		description: 'Launch a notebook server',
		defaultOptions: {
			port: 1234,
			dir: '/workspace',
			token: ''
		},
		buildCommand(base, { port, dir, token }, { debugMode }) {
			const dbg = debugMode ? 'set -x; ' : '';
			// Double quotes here too — same reason as vscode
			const tokenPart = `--ServerApp.token="${token}"`;
			return (
				`${base} \\\n\t--pty bash -c ` +
				`'${dbg}pip install -q jupyterlab 2>/dev/null; ` +
				`jupyter lab --ip=0.0.0.0 --port=${port} --no-browser ${tokenPart} --notebook-dir=${dir}'`
			);
		},
		buildConnectInstructions({ port }) {
			return (
				`# 1. Note the compute node hostname printed in the terminal (e.g. gpu001)\n` +
				`# 2. On your LOCAL machine, open an SSH tunnel:\n` +
				`ssh -L ${port}:COMPUTE_NODE:${port} YOUR_LOGIN_NODE\n` +
				`# 3. Open in your browser:\n` +
				`#    http://localhost:${port}`
			);
		}
	};
</script>

<script lang="ts">
	let { options }: { options: { port: number; dir: string; token: string } } = $props();
</script>

<div class="input-group grid-cols-[auto_1fr]">
	<div class="ig-cell justify-start preset-tonal">Port</div>
	<input class="ig-input" type="number" min="1024" max="65535" bind:value={options.port} />

	<div class="ig-cell justify-start preset-tonal">Directory</div>
	<input
		class="ig-input font-mono text-sm"
		type="text"
		bind:value={options.dir}
		placeholder="/workspace"
	/>

	<div class="ig-cell justify-start preset-tonal">Token</div>
	<input
		class="ig-input"
		type="text"
		bind:value={options.token}
		placeholder="Leave empty for no authentication"
	/>
</div>
