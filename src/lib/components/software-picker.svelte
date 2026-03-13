<script lang="ts">
	import { type Snippet } from 'svelte';
	import { Laptop, Terminal, NotebookText, Server } from '@lucide/svelte';

	interface SoftwarePickerProps {
		children: Snippet;
		selected?: any;
		setSelected: any;
	}

	let { children, selected, setSelected }: SoftwarePickerProps = $props();

	const options = [
		{
			id: 'bash',
			label: 'Bash Shell',
			icon: Terminal,
			description: 'Open an interactive shell'
		},
		{
			id: 'vscode',
			label: 'VS Code',
			icon: Laptop,
			description: 'Run VS Code in the browser'
		},
		{
			id: 'jupyter',
			label: 'Jupyter Lab',
			icon: NotebookText,
			description: 'Launch a notebook server'
		},
		{
			id: 'ssh',
			label: 'SSH Server',
			icon: Server,
			description: 'Connect with your own IDE'
		}
	];
</script>

<div class="flex flex-row flex-wrap gap-3">
	{#each options as opt (opt.id)}
		{@const Icon = opt.icon}
		<button
			type="button"
			class="card card-hover w-32 divide-y divide-surface-200-800 overflow-hidden border-[1px] preset-filled-surface-100-900
				{selected?.id === opt.id ? 'preset-outlined-primary-500' : 'border-surface-200-800'}"
			onclick={() => setSelected(opt)}
		>
			<article class="flex flex-col items-center gap-2 p-3">
				<Icon class="h-6 w-6" />
				<span class="font-semibold text-sm">{opt.label}</span>
			</article>
			<footer class="px-3 py-1">
				<small class="opacity-60 text-xs">{opt.description}</small>
			</footer>
		</button>
	{/each}
</div>

<div class="mt-4">
	{@render children()}
</div>
