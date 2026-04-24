<script module lang="ts">
	import { Laptop } from '@lucide/svelte';
	import type { SoftwareDefinition } from './types';

	export const vscode: SoftwareDefinition = {
		id: 'vscode',
		label: 'VS Code',
		icon: Laptop,
		description: 'Run VS Code in the browser',
		defaultOptions: {
			port: 1234,
			password: '',
			extensions: ''
		},
		buildCommand(base, { port, password, extensions }, { debugMode }) {
			const dbg = debugMode ? 'set -x; ' : '';
			// Use double quotes — single quotes inside a single-quoted bash -c '...' break parsing
			const authFlag = password ? '--auth password' : '--auth none';
			const pwExport = password ? `export PASSWORD="${password}"; ` : '';
			const extInstall = extensions
				? extensions
						.split(',')
						.map((e: string) => `code-server --install-extension ${e.trim()}`)
						.join('; ') + '; '
				: '';
			return (
				`${base} \\\n\t--pty bash -c ` +
				`'${dbg}${pwExport}apt-get update -qq; ` +
				`apt-get install -y -qq curl; ` +
				`curl -fsSL https://code-server.dev/install.sh | sh; ` +
				`${extInstall}` +
				`code-server --bind-addr 0.0.0.0:${port} ${authFlag} --disable-telemetry'`
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
	let { options }: { options: { port: number; password: string; extensions: string } } = $props();
</script>

<div class="input-group grid-cols-[auto_1fr]">
	<div class="ig-cell justify-start preset-tonal">Port</div>
	<input class="ig-input" type="number" min="1024" max="65535" bind:value={options.port} />

	<div class="ig-cell justify-start preset-tonal">Password</div>
	<input
		class="ig-input"
		type="text"
		bind:value={options.password}
		placeholder="Leave empty for no authentication"
	/>

	<div class="ig-cell justify-start preset-tonal">Extensions</div>
	<input
		class="ig-input font-mono text-sm"
		type="text"
		bind:value={options.extensions}
		placeholder="ms-python.python, ms-toolsai.jupyter"
	/>
</div>
