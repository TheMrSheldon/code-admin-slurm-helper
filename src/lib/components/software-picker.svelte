<script lang="ts">
	import { type Snippet } from 'svelte';
	import { Laptop, Terminal, Notebook } from '@lucide/svelte';

	interface SoftwarePickerProps {
		children: Snippet;
		selected?: any;
		setSelected: any;
	}

	let { children, selected, setSelected }: SoftwarePickerProps = $props();

	// Available options
	const options = [
		{
			id: 'bash',
			label: 'Bash Shell',
			icon: Terminal,
			description: 'Open a shell environment',
			disabled: false
		},
		{
			id: 'vscode',
			label: 'VS Code',
			icon: Laptop,
			description: 'Run VS Code remotely',
			disabled: false
		},
		{
			id: 'jupyter',
			label: 'Jupyter Notebook',
			icon: Notebook,
			description: 'Launch a notebook server',
			disabled: true
		},
		{
			id: 'ssh',
			label: 'SSH',
			icon: Terminal,
			description: 'Run an SSH server',
			disabled: true
		}
	];
</script>

<!-- OPTIONS ROW -->
<div class="flex flex-row gap-4">
	{#each options as opt}
		<button
			type="button"
			class={`block max-w-md divide-y divide-surface-200-800 overflow-hidden card border-[1px] preset-filled-surface-100-900 card-hover
				${selected === opt ? 'preset-outlined-primary-500' : 'border-surface-200-800'}
			`}
			onclick={() => setSelected(opt)}
			disabled={opt.disabled}
		>
			<article class="space-y-4 p-2">
				<svelte:component this={opt.icon} class="inline h-7 w-7" />
				<h2>{opt.label}</h2>
			</article>
			<footer class="flex items-center justify-between gap-1 p-1">
				<small class="opacity-60">{opt.description}</small>
			</footer>
		</button>
	{/each}
</div>

{@render children()}
