<script lang="ts">
	import { type Snippet } from 'svelte';
	import type { SoftwareType } from '$lib/software/types';

	interface SoftwarePickerProps {
		children: Snippet;
		options: SoftwareType[];
		selected?: SoftwareType | null;
		setSelected: (item: SoftwareType) => void;
	}

	let { children, options, selected, setSelected }: SoftwarePickerProps = $props();
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
