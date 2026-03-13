<script lang="ts">
	import CodeBlock from '$lib/components/code-block.svelte';
	import { Collapsible } from '@skeletonlabs/skeleton-svelte';
	import { MessageCircleQuestionMarkIcon, Check, ChevronLeft, ChevronRight } from '@lucide/svelte';
	import SoftwarePicker from '$lib/components/software-picker.svelte';

	// Wizard
	let step = $state(1);
	const STEPS = ['Software', 'Hardware', 'Container', 'Command'];

	// Hardware
	let cpupertask = $state(2);
	let ramgb = $state(32);
	let gres = $state('2g.10gb');
	let timeLimit = $state('4:00:00');
	let partition = $state('');
	let jobName = $state('');

	// Container
	let baseimage = $state('pytorch/pytorch:2.8.0-cuda12.9-cudnn9-runtime');
	let flags = $state({ writable: true, remaproot: true });
	let containerMounts = $state('');

	type SoftwareOption = { id: string; label: string };

	// Software selection
	let selectedSoftware = $state<SoftwareOption | null>(null);
	let port = $state(1234);

	// Bash options
	let bashCommand = $state('');
	let bashInteractive = $state(true);

	// VS Code options
	let vsPassword = $state('');
	let vsExtensions = $state('');

	// Jupyter options
	let jupyterDir = $state('/workspace');
	let jupyterToken = $state('');

	// SSH options
	let sshPassword = $state('changeme');
	let sshPublicKey = $state('');

	// Global
	let debugMode = $state(false);

	let canNext = $derived(step !== 1 || selectedSoftware !== null);

	function next() {
		if (step < STEPS.length && canNext) step++;
	}
	function back() {
		if (step > 1) step--;
	}
	function goTo(n: number) {
		if (n < step) step = n;
	}

	function buildSrunBase(): string {
		let cmd = 'srun';
		if (jobName) cmd += ` \\\n\t--job-name=${jobName}`;
		cmd += ` \\\n\t--container-image=${baseimage}`;
		cmd += ` \\\n\t--mem=${ramgb}g`;
		cmd += ` \\\n\t--cpus-per-task=${cpupertask}`;
		if (gres) cmd += ` \\\n\t--gres=gpu:${gres}:1`;
		if (timeLimit) cmd += ` \\\n\t--time=${timeLimit}`;
		if (partition) cmd += ` \\\n\t--partition=${partition}`;
		if (containerMounts) cmd += ` \\\n\t--container-mounts=${containerMounts}`;
		if (flags.writable) cmd += ` \\\n\t--container-writable`;
		if (flags.remaproot) cmd += ` \\\n\t--container-remap-root`;
		return cmd;
	}

	let command = $derived.by(() => {
		const base = buildSrunBase();
		if (!selectedSoftware) return '# Select a software type above';

		const dbg = debugMode ? 'set -x; ' : '';

		if (selectedSoftware.id === 'bash') {
			const prefix = bashInteractive ? '--pty bash' : 'bash';
			if (bashCommand) return `${base} \\\n\t${prefix} -c '${dbg}${bashCommand}'`;
			if (debugMode) return `${base} \\\n\t--pty bash -c '${dbg}'`;
			return `${base} \\\n\t${prefix}`;
		}

		if (selectedSoftware.id === 'vscode') {
			const authFlag = vsPassword ? '--auth password' : '--auth none';
			// Use double quotes — single quotes inside a single-quoted bash -c '...' break parsing
			const pwExport = vsPassword ? `export PASSWORD="${vsPassword}"; ` : '';
			const extInstall = vsExtensions
				? vsExtensions
						.split(',')
						.map((e) => `code-server --install-extension ${e.trim()}`)
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
		}

		if (selectedSoftware.id === 'jupyter') {
			// Double quotes here too — same reason
			const tokenPart = `--ServerApp.token="${jupyterToken}"`;
			return (
				`${base} \\\n\t--pty bash -c ` +
				`'${dbg}pip install -q jupyterlab 2>/dev/null; ` +
				`jupyter lab --ip=0.0.0.0 --port=${port} --no-browser ${tokenPart} --notebook-dir=${jupyterDir}'`
			);
		}

		if (selectedSoftware.id === 'ssh') {
			// openssh-server fails in remapped-root containers: after privsep drops to the sshd
			// system user, it verifies CAP_SETGID is gone — but container root retains it, so
			// the security check kills the connection. Dropbear has no privsep and works fine.
			const authSteps: string[] = [];
			if (sshPassword) authSteps.push(`echo root:${sshPassword} | chpasswd`);
			if (sshPublicKey.trim())
				authSteps.push(
					`mkdir -p /root/.ssh && ` +
						`echo "${sshPublicKey.trim()}" >> /root/.ssh/authorized_keys && ` +
						`chmod 700 /root/.ssh && chmod 600 /root/.ssh/authorized_keys`
				);
			// Dropbear allows password and key auth simultaneously by default
			// -v adds per-connection verbose logging in debug mode
			// Host key is persisted in $HOME so the client's known_hosts entry stays valid
			// across job restarts, avoiding "REMOTE HOST IDENTIFICATION HAS CHANGED" warnings.
			const hostKey = '"$HOME/.cache/webis-slurm-tool/ssh/dropbear_ed25519_host_key"';
			const dropbearCmd = `dropbear -F -E${debugMode ? ' -v' : ''} -p ${port} -r ${hostKey}`;
			const steps = [
				debugMode ? 'set -x' : null,
				'apt-get update -qq',
				'apt-get install -y -qq dropbear',
				// Slurm sets $HOME to the real user home even under --container-remap-root,
				// so we can seed root's authorized_keys from the cluster home directory.
				'mkdir -p /root/.ssh; cp "$HOME/.ssh/authorized_keys" /root/.ssh/authorized_keys 2>/dev/null; chmod 700 /root/.ssh; chmod 600 /root/.ssh/authorized_keys 2>/dev/null; true',
				...authSteps,
				// Persist the host key so reconnections don't trigger "host key changed" warnings
				`mkdir -p "$HOME/.cache/webis-slurm-tool/ssh" && { [ -f ${hostKey} ] || dropbearkey -t ed25519 -f ${hostKey}; }`,
				`echo && echo "=== SSH ready: root@$(hostname) port ${port} ===" && echo`,
				dropbearCmd
			]
				.filter((s) => s !== null)
				.join(' && \\\n\t\t');
			return `${base} \\\n\t--pty bash -c '\n\t\t${steps}\n\t'`;
		}

		return '# Unknown software';
	});

	let connectInstructions = $derived.by(() => {
		if (!selectedSoftware) return '';

		if (selectedSoftware.id === 'vscode' || selectedSoftware.id === 'jupyter') {
			return (
				`# 1. Note the compute node hostname printed in the terminal (e.g. gpu001)\n` +
				`# 2. On your LOCAL machine, open an SSH tunnel:\n` +
				`ssh -L ${port}:COMPUTE_NODE:${port} YOUR_LOGIN_NODE\n` +
				`# 3. Open in your browser:\n` +
				`#    http://localhost:${port}`
			);
		}

		if (selectedSoftware.id === 'ssh') {
			return (
				`# 1. Note the compute node hostname printed in the terminal (e.g. gpu001)\n` +
				`# 2. Connect as root (Slurm maps you to root inside the container):\n` +
				`#    Your existing cluster SSH keys are copied in automatically.\n` +
				`ssh -J YOUR_LOGIN_NODE -p ${port} root@COMPUTE_NODE\n` +
				`#\n` +
				`# Alternatively, use port forwarding:\n` +
				`ssh -L ${port}:COMPUTE_NODE:${port} YOUR_LOGIN_NODE\n` +
				`ssh -p ${port} root@localhost`
			);
		}

		return '';
	});
</script>

<div class="mx-auto max-w-2xl space-y-6 px-4 py-10">
	<header class="space-y-1">
		<h1>Slurm Job Launcher</h1>
		<p class="text-sm opacity-60">
			Generate an <code>srun</code> command to run an interactive job on the cluster.
		</p>
	</header>

	<!-- Step indicator -->
	<nav class="flex items-center gap-1">
		{#each STEPS as label, i}
			{@const n = i + 1}
			{@const done = step > n}
			{@const active = step === n}
			<button
				type="button"
				class="flex min-w-0 shrink items-center gap-1.5 {done ? 'cursor-pointer' : 'cursor-default'}"
				onclick={() => goTo(n)}
				disabled={!done}
			>
				<div
					class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold
					{active
						? 'bg-primary-500 text-white'
						: done
							? 'bg-primary-200 text-primary-700 dark:bg-primary-800 dark:text-primary-200'
							: 'bg-surface-200-800 text-surface-500'}"
				>
					{#if done}
						<Check size="12" />
					{:else}
						{n}
					{/if}
				</div>
				<span
					class="truncate text-sm
					{active ? 'font-semibold' : done ? 'opacity-60' : 'opacity-30'}">{label}</span
				>
			</button>
			{#if n < STEPS.length}
				<div
					class="h-px min-w-4 flex-1
					{step > n ? 'bg-primary-300 dark:bg-primary-700' : 'bg-surface-200-800'}"
				></div>
			{/if}
		{/each}
	</nav>

	<form
		class="space-y-6"
		onsubmit={(e) => e.preventDefault()}
	>
		<!-- Step 1: Software -->
		{#if step === 1}
			<section class="card preset-filled-surface-50-950 space-y-4 p-5">
				<div>
					<h2>What do you want to run?</h2>
					<p class="mt-0.5 text-sm opacity-50">Choose a software type, then configure it below.</p>
				</div>
				<SoftwarePicker
					selected={selectedSoftware}
					setSelected={(item: SoftwareOption) => {
						selectedSoftware = item;
					}}
				>
					{#if selectedSoftware == null}
						<p class="text-sm opacity-40">Select a software type above to configure options.</p>
					{:else if selectedSoftware.id === 'bash'}
						<div class="input-group grid-cols-[auto_1fr]">
							<div class="ig-cell justify-start preset-tonal">Command</div>
							<input
								class="ig-input font-mono text-sm"
								type="text"
								bind:value={bashCommand}
								placeholder="Leave empty for an interactive shell"
							/>

							<div class="ig-cell justify-start preset-tonal">Options</div>
							<div class="ig-cell">
								<label class="flex cursor-pointer items-center gap-2">
									<input class="checkbox" type="checkbox" bind:checked={bashInteractive} />
									<span>Allocate a pseudo-terminal (--pty)</span>
								</label>
							</div>
						</div>
					{:else if selectedSoftware.id === 'vscode'}
						<div class="input-group grid-cols-[auto_1fr]">
							<div class="ig-cell justify-start preset-tonal">Port</div>
							<input class="ig-input" type="number" min="1024" max="65535" bind:value={port} />

							<div class="ig-cell justify-start preset-tonal">Password</div>
							<input
								class="ig-input"
								type="text"
								bind:value={vsPassword}
								placeholder="Leave empty for no authentication"
							/>

							<div class="ig-cell justify-start preset-tonal">Extensions</div>
							<input
								class="ig-input font-mono text-sm"
								type="text"
								bind:value={vsExtensions}
								placeholder="ms-python.python, ms-toolsai.jupyter"
							/>
						</div>
					{:else if selectedSoftware.id === 'jupyter'}
						<div class="input-group grid-cols-[auto_1fr]">
							<div class="ig-cell justify-start preset-tonal">Port</div>
							<input class="ig-input" type="number" min="1024" max="65535" bind:value={port} />

							<div class="ig-cell justify-start preset-tonal">Directory</div>
							<input
								class="ig-input font-mono text-sm"
								type="text"
								bind:value={jupyterDir}
								placeholder="/workspace"
							/>

							<div class="ig-cell justify-start preset-tonal">Token</div>
							<input
								class="ig-input"
								type="text"
								bind:value={jupyterToken}
								placeholder="Leave empty for no authentication"
							/>
						</div>
					{:else if selectedSoftware.id === 'ssh'}
						<div class="input-group grid-cols-[auto_1fr]">
							<div class="ig-cell justify-start preset-tonal">Port</div>
							<input class="ig-input" type="number" min="1024" max="65535" bind:value={port} />

							<div class="ig-cell justify-start preset-tonal">Password</div>
							<input
								class="ig-input"
								type="text"
								bind:value={sshPassword}
								placeholder="Leave empty to disable password auth"
							/>

							<div class="ig-cell justify-start preset-tonal">Public Key</div>
							<input
								class="ig-input font-mono text-xs"
								type="text"
								bind:value={sshPublicKey}
								placeholder="ssh-ed25519 AAAA… (optional, added alongside password)"
							/>
						</div>
					{/if}
				</SoftwarePicker>
			</section>
		{/if}

		<!-- Step 2: Hardware -->
		{#if step === 2}
			<section class="card preset-filled-surface-50-950 space-y-4 p-5">
				<div>
					<h2>How much compute?</h2>
					<p class="mt-0.5 text-sm opacity-50">
						Request only what you need — over-requesting increases queue wait times.
					</p>
				</div>
				<div class="input-group grid-cols-[auto_auto_1fr_auto]">
					<!-- RAM -->
					<Collapsible class="col-span-4 grid grid-cols-subgrid">
						<div class="ig-cell justify-start preset-tonal">RAM</div>
						<Collapsible.Trigger class="ig-btn preset-tonal p-0">
							<MessageCircleQuestionMarkIcon class="h-4 w-4" />
						</Collapsible.Trigger>
						<input class="ig-input" type="range" min="4" max="256" step="4" bind:value={ramgb} />
						<div class="ig-cell w-20 justify-center preset-tonal">{ramgb} GB</div>
						<Collapsible.Content class="col-span-4 preset-tonal-primary px-4 py-2 text-sm">
							Request RAM for your job. Most interactive tasks need 8–64 GB. Requesting more than
							you need may increase queue wait time.
						</Collapsible.Content>
					</Collapsible>

					<!-- CPU -->
					<Collapsible class="col-span-4 grid grid-cols-subgrid">
						<div class="ig-cell justify-start preset-tonal">CPU</div>
						<Collapsible.Trigger class="ig-btn preset-tonal p-0">
							<MessageCircleQuestionMarkIcon class="h-4 w-4" />
						</Collapsible.Trigger>
						<input
							class="ig-input"
							type="range"
							min="1"
							max="32"
							step="1"
							bind:value={cpupertask}
						/>
						<div class="ig-cell w-20 justify-center preset-tonal">{cpupertask} cores</div>
						<Collapsible.Content class="col-span-4 preset-tonal-primary px-4 py-2 text-sm">
							Number of CPU cores. 4–8 cores is typically sufficient for most workloads. GPU
							training rarely benefits from more than 8 cores.
						</Collapsible.Content>
					</Collapsible>

					<!-- GPU -->
					<Collapsible class="col-span-4 grid grid-cols-subgrid">
						<div class="ig-cell justify-start preset-tonal">GPU</div>
						<Collapsible.Trigger class="ig-btn preset-tonal p-0">
							<MessageCircleQuestionMarkIcon class="h-4 w-4" />
						</Collapsible.Trigger>
						<select class="col-span-2 ig-select" bind:value={gres}>
							<option value="">None (CPU only)</option>
							<option value="2g.10gb">A-100 quarter slice (10 GB VRAM)</option>
							<option value="3g.20gb">A-100 half slice (20 GB VRAM)</option>
							<option value="ampere">A-100 full (40 GB VRAM)</option>
							<option value="hopper">H-100 full (95 GB VRAM)</option>
						</select>
						<Collapsible.Content class="col-span-4 preset-tonal-primary px-4 py-2 text-sm">
							MIG slices (10/20 GB) are shared GPU partitions — great for development and smaller
							models. Full GPUs are best for training large models. Leave empty for CPU-only jobs.
						</Collapsible.Content>
					</Collapsible>

					<!-- Time limit -->
					<Collapsible class="col-span-4 grid grid-cols-subgrid">
						<div class="ig-cell justify-start preset-tonal">Time limit</div>
						<Collapsible.Trigger class="ig-btn preset-tonal p-0">
							<MessageCircleQuestionMarkIcon class="h-4 w-4" />
						</Collapsible.Trigger>
						<select class="col-span-2 ig-select" bind:value={timeLimit}>
							<option value="">No limit</option>
							<option value="1:00:00">1 hour</option>
							<option value="4:00:00">4 hours</option>
							<option value="8:00:00">8 hours</option>
							<option value="1-00:00:00">1 day</option>
							<option value="3-00:00:00">3 days</option>
							<option value="7-00:00:00">1 week</option>
						</select>
						<Collapsible.Content class="col-span-4 preset-tonal-primary px-4 py-2 text-sm">
							Maximum wall-clock time for your job. The job is killed when the limit is reached.
							Setting a realistic limit helps the scheduler place your job faster.
						</Collapsible.Content>
					</Collapsible>
				</div>

				<!-- Optional fields -->
				<div class="input-group grid-cols-[auto_1fr]">
					<div class="ig-cell justify-start preset-tonal">Partition</div>
					<input
						class="ig-input"
						type="text"
						bind:value={partition}
						placeholder="Leave empty for default"
					/>

					<div class="ig-cell justify-start preset-tonal">Job name</div>
					<input
						class="ig-input"
						type="text"
						bind:value={jobName}
						placeholder="Shown in squeue output (optional)"
					/>
				</div>
			</section>
		{/if}

		<!-- Step 3: Container -->
		{#if step === 3}
			<section class="card preset-filled-surface-50-950 space-y-4 p-5">
				<div>
					<h2>Container settings</h2>
					<p class="mt-0.5 text-sm opacity-50">Configure the container image and runtime options.</p>
				</div>
				<div class="input-group grid-cols-[auto_1fr]">
					<div class="ig-cell justify-start preset-tonal">Base image</div>
					<input
						class="ig-input font-mono text-sm"
						type="text"
						bind:value={baseimage}
						placeholder="docker.io/library/ubuntu:24.04"
					/>

					<div class="ig-cell justify-start preset-tonal">Mounts</div>
					<input
						class="ig-input font-mono text-sm"
						type="text"
						bind:value={containerMounts}
						placeholder="/data:/data,/scratch:/scratch (optional)"
					/>

					<div class="ig-cell justify-start preset-tonal">Options</div>
					<div class="ig-cell flex-col items-start gap-2">
						<label class="flex cursor-pointer items-center gap-2">
							<input class="checkbox" type="checkbox" bind:checked={flags.writable} />
							<span>Writable filesystem</span>
						</label>
						<label class="flex cursor-pointer items-center gap-2">
							<input class="checkbox" type="checkbox" bind:checked={flags.remaproot} />
							<span>Remap to root inside container</span>
						</label>
					</div>
				</div>
			</section>
		{/if}

		<!-- Step 4: Command -->
		{#if step === 4}
			<section class="card preset-filled-surface-50-950 space-y-4 p-5">
				<div class="flex items-center justify-between gap-4">
					<div>
						<h2>Your command</h2>
						<p class="mt-0.5 text-sm opacity-50">
							Run this on the login node. The job starts immediately in the terminal.
						</p>
					</div>
					<label class="flex shrink-0 cursor-pointer items-center gap-2 text-sm">
						<input class="checkbox" type="checkbox" bind:checked={debugMode} />
						<span>Debug mode</span>
					</label>
				</div>
				<CodeBlock code={command} lang="bash" />
			</section>

			{#if connectInstructions}
				<section class="card preset-filled-surface-50-950 space-y-3 p-5">
					<h2>How to connect</h2>
					<CodeBlock code={connectInstructions} lang="bash" />
				</section>
			{/if}
		{/if}

		<!-- Navigation -->
		<div class="flex items-center justify-between">
			{#if step > 1}
				<button type="button" class="btn preset-tonal gap-1.5" onclick={back}>
					<ChevronLeft size="16" />
					Back
				</button>
			{:else}
				<div></div>
			{/if}
			{#if step < STEPS.length}
				<button
					type="button"
					class="btn preset-filled gap-1.5 {!canNext ? 'opacity-40' : ''}"
					onclick={next}
					disabled={!canNext}
				>
					Next
					<ChevronRight size="16" />
				</button>
			{/if}
		</div>
	</form>
</div>
