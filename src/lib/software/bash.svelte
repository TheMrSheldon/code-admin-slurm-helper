<script module lang="ts">
	import { Terminal } from '@lucide/svelte';
	import type { SoftwareDefinition, AnnotatedCommand } from './types';
	import { buildBaseSegments } from './builder';

	export const bash: SoftwareDefinition = {
		id: 'bash',
		label: 'Bash Shell',
		icon: Terminal,
		description: 'Open an interactive shell',
		defaultOptions: {
			command: '',
			interactive: true
		},
		buildCommand(ctx, { command, interactive }): AnnotatedCommand {
			const segments = buildBaseSegments(ctx);

			if (ctx.jobType === 'sbatch') {
				// For sbatch: produce a job script template
				segments.push({
					code: '\n\n',
					annotation: undefined
				});
				if (ctx.debugMode) {
					segments.push({ code: 'set -x\n' });
				}
				if (command) {
					segments.push({
						code: command,
						annotation: {
							title: 'Your command',
							description:
								'The command(s) that will run when the job starts. Edit this to run your training script, data pipeline, or any other workload.'
						}
					});
				} else {
					segments.push({
						code: '# Replace this with your command, e.g.:\n# python train.py',
						annotation: {
							title: 'Your command',
							description:
								'Replace this placeholder with the command you want to run, e.g. python train.py --epochs 100.'
						}
					});
				}
				return { jobType: 'sbatch', segments };
			}

			// srun interactive shell
			const dbg = ctx.debugMode ? 'set -x; ' : '';
			if (interactive) {
				if (command) {
					segments.push({
						code: ` \\\n\t--pty bash -c '${dbg}${command}'`,
						annotation: {
							title: 'Shell command',
							description:
								'Runs the specified command in a pseudo-terminal (--pty). The --pty flag allocates a terminal so interactive programs (vim, top, etc.) work correctly.'
						}
					});
				} else if (ctx.debugMode) {
					segments.push({
						code: ` \\\n\t--pty bash -c '${dbg}'`,
						annotation: {
							title: 'Interactive shell',
							description:
								'Opens an interactive bash shell in a pseudo-terminal. --pty allocates a terminal device, required for interactive use.'
						}
					});
				} else {
					segments.push({
						code: ` \\\n\t--pty bash`,
						annotation: {
							title: 'Interactive shell',
							description:
								'Opens an interactive bash shell in a pseudo-terminal. --pty allocates a terminal device, required for interactive use.'
						}
					});
				}
			} else {
				if (command) {
					segments.push({
						code: ` \\\n\tbash -c '${dbg}${command}'`,
						annotation: {
							title: 'Shell command',
							description: 'Runs the specified command non-interactively (no terminal allocation).'
						}
					});
				} else {
					segments.push({
						code: ` \\\n\tbash`,
						annotation: {
							title: 'Non-interactive shell',
							description: 'Opens a bash shell without a pseudo-terminal.'
						}
					});
				}
			}

			return { jobType: 'srun', segments };
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
