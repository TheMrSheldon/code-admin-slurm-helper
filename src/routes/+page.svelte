<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import CodeBlock from '$lib/components/code-block.svelte';
	import AnnotatedCodeBlock from '$lib/components/annotated-code-block.svelte';
	import FlipCard from '$lib/components/flip-card.svelte';
	import { Collapsible } from '@skeletonlabs/skeleton-svelte';
	import {
		MessageCircleQuestionMarkIcon,
		Check,
		ChevronLeft,
		ChevronRight,
		Bug,
		Brain,
		Zap,
		Database,
		Terminal,
		Server,
		NotebookText,
		Clock,
		Settings,
		Code2,
		Braces
	} from '@lucide/svelte';
	import { SOFTWARE_TYPES, type SoftwareType } from '$lib/software';
	import { loadConfig, type AppConfig, type Stage, type ClusterInterface } from '$lib/config';
	import type { BuildContext, AnnotatedCommand } from '$lib/software/types';
	import type { Component } from 'svelte';
	import { fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';

	// ── Wizard ────────────────────────────────────────────────────────────────
	const STEPS = ['Project', 'Stage', 'Interface', 'Hardware', 'Container', 'Command'];
	let step = $state(1);
	let hasProjectFromUrl = $state(false);
	let navDirection = $state<'forward' | 'backward'>('forward');

	// ── Config (loaded from YAML) ─────────────────────────────────────────────
	let config = $state<AppConfig | null>(null);
	let configError = $state('');

	// ── Project ───────────────────────────────────────────────────────────────
	let project = $state('');

	// ── Stage ─────────────────────────────────────────────────────────────────
	let selectedStage = $state<Stage | null>(null);
	let subAnswers = $state<Record<string, string>>({}); // subQuestion.id → option label

	// ── Interface ─────────────────────────────────────────────────────────────
	let selectedInterface = $state<ClusterInterface | null>(null);
	let selectedSoftware = $state<SoftwareType | null>(null);
	let softwareOptions = $state<Record<string, unknown>>({});

	// ── Hardware ──────────────────────────────────────────────────────────────
	let cpupertask = $state(2);
	let ramgb = $state(32);
	let gres = $state('2g.10gb');
	let timeLimit = $state('4:00:00');
	let partition = $state('');
	let jobName = $state('');

	// ── Container ─────────────────────────────────────────────────────────────
	let baseimage = $state('pytorch/pytorch:2.8.0-cuda12.9-cudnn9-runtime');
	let flags = $state({ writable: true, remaproot: true });
	let containerMounts = $state('');

	// ── Global ────────────────────────────────────────────────────────────────
	let debugMode = $state(false);
	let settingsOpen = $state(false);

	// ── Lifecycle ─────────────────────────────────────────────────────────────
	onMount(async () => {
		// Read ?project= query param
		const urlProject = page.url.searchParams.get('project');
		if (urlProject) {
			project = urlProject;
			hasProjectFromUrl = true;
			step = 2; // skip project step
		}

		// Load YAML config
		try {
			config = await loadConfig();
		} catch (e) {
			configError = String(e);
		}
	});

	// ── Stage icon map ────────────────────────────────────────────────────────
	const stageIcons: Record<string, Component> = {
		debugging: Bug,
		training: Brain,
		inference: Zap,
		data: Database
	};

	// ── Interface icon map ────────────────────────────────────────────────────
	const interfaceIcons: Record<string, Component> = {
		shell: Terminal,
		ssh: Server,
		vscode: Code2,
		pycharm: Braces,
		jupyter: NotebookText,
		batch: Clock
	};

	// ── Navigation ────────────────────────────────────────────────────────────
	let allSubAnswered = $derived(
		!selectedStage?.sub_questions?.length ||
			selectedStage.sub_questions.every((q) => subAnswers[q.id])
	);

	let canNext = $derived(
		step === 1
			? project.trim() !== ''
			: step === 2
				? selectedStage !== null && allSubAnswered
				: step === 3
					? selectedInterface !== null
					: true
	);

	function next() {
		if (step < STEPS.length && canNext) { navDirection = 'forward'; step++; }
	}
	function back() {
		if (step > (hasProjectFromUrl ? 2 : 1)) { navDirection = 'backward'; step--; }
	}
	function goTo(n: number) {
		if (n < step) { navDirection = 'backward'; step = n; }
	}

	// ── Settings detection ────────────────────────────────────────────────────
	function stageHasSettings(stage: Stage): boolean {
		return (stage.sub_questions?.length ?? 0) > 0;
	}

	function ifaceHasSettings(iface: ClusterInterface): boolean {
		return iface.software_id === 'ssh' || iface.software_id === 'jupyter';
	}

	// ── Stage selection ───────────────────────────────────────────────────────
	function selectStage(stage: Stage) {
		selectedStage = stage;
		subAnswers = {};
		// Apply hardware defaults
		cpupertask = stage.hardware_defaults.cpus;
		ramgb = stage.hardware_defaults.ram_gb;
		gres = stage.hardware_defaults.gpu;
		timeLimit = stage.hardware_defaults.time;
	}

	function unselectStage() {
		selectedStage = null;
		subAnswers = {};
	}

	function selectSubAnswer(questionId: string, optionLabel: string, overrides: Record<string, unknown>) {
		subAnswers = { ...subAnswers, [questionId]: optionLabel };
		// Apply hardware overrides
		if (typeof overrides.cpus === 'number') cpupertask = overrides.cpus;
		if (typeof overrides.ram_gb === 'number') ramgb = overrides.ram_gb;
		if (typeof overrides.gpu === 'string') gres = overrides.gpu;
		if (typeof overrides.time === 'string') timeLimit = overrides.time;
	}

	// ── Interface selection ───────────────────────────────────────────────────
	function selectInterface(iface: ClusterInterface) {
		selectedInterface = iface;
		const sw = SOFTWARE_TYPES.find((s) => s.id === iface.software_id) ?? null;
		selectedSoftware = sw;
		softwareOptions = sw
			? { ...sw.defaultOptions, ...(iface.software_option_overrides ?? {}) }
			: {};
	}

	function unselectInterface() {
		selectedInterface = null;
		selectedSoftware = null;
		softwareOptions = {};
	}

	// ── Command building ──────────────────────────────────────────────────────
	let buildContext = $derived.by((): BuildContext => ({
		jobType: selectedInterface?.job_type ?? 'srun',
		account: project,
		hardware: {
			cpus: cpupertask,
			ramGb: ramgb,
			gres,
			timeLimit,
			partition,
			jobName
		},
		container: {
			image: baseimage,
			mounts: containerMounts,
			writable: flags.writable,
			remapRoot: flags.remaproot
		},
		debugMode
	}));

	let command = $derived.by((): AnnotatedCommand | null => {
		if (!selectedSoftware) return null;
		return selectedSoftware.buildCommand(buildContext, softwareOptions);
	});

	let connectInstructions = $derived.by(() => {
		if (!selectedSoftware?.buildConnectInstructions) return '';
		return selectedSoftware.buildConnectInstructions(softwareOptions, debugMode);
	});

	// ── Step display helpers ──────────────────────────────────────────────────
	function isStepVisible(n: number) {
		return hasProjectFromUrl ? n >= 2 : true;
	}
</script>

<div class="mx-auto max-w-3xl space-y-6 overflow-x-hidden px-4 py-10">
	<header class="space-y-1">
		<h1>Slurm Job Launcher</h1>
		<p class="text-sm opacity-60">
			Generate an <code>srun</code> or <code>sbatch</code> command to run jobs on the cluster.
		</p>
	</header>

	{#if configError}
		<div class="card preset-filled-error-500 p-4 text-sm">
			Failed to load configuration: {configError}
		</div>
	{/if}

	<!-- Step indicator -->
	<nav class="flex items-center gap-1">
		{#each STEPS as label, i}
			{@const n = i + 1}
			{#if isStepVisible(n)}
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
							{hasProjectFromUrl ? n - 1 : n}
						{/if}
					</div>
					<span
						class="truncate text-sm
						{active ? 'font-semibold' : done ? 'opacity-60' : 'opacity-30'}">{label}</span
					>
				</button>
				{#if n < STEPS.length && isStepVisible(n + 1)}
					<div
						class="h-px min-w-4 flex-1
						{step > n ? 'bg-primary-300 dark:bg-primary-700' : 'bg-surface-200-800'}"
					></div>
				{/if}
			{/if}
		{/each}
	</nav>

	<form class="space-y-6" onsubmit={(e) => e.preventDefault()}>

		{#key step}
			<div
				class="space-y-6"
				in:fly={{
					x: navDirection === 'forward' ? 48 : -48,
					duration: 250,
					opacity: 0,
					easing: cubicOut
				}}
			>
			<!-- Step 1: Project -->
			{#if step === 1}
				<section class="card preset-filled-surface-50-950 space-y-4 p-5">
					<div>
						<h2>What is your project name?</h2>
						<p class="mt-0.5 text-sm opacity-50">
							Used for SLURM accounting (<code>--account</code>). Your supervisor can share a link
							with this pre-filled.
						</p>
					</div>
					<div class="input-group grid-cols-[auto_1fr]">
						<div class="ig-cell justify-start preset-tonal">Project</div>
						<input
							class="ig-input"
							type="text"
							bind:value={project}
							placeholder="e.g. nlp-lab or cv-research"
							onkeydown={(e) => { if (e.key === 'Enter' && canNext) next(); }}
						/>
					</div>
				</section>
			{/if}

			<!-- Step 2: Stage -->
			{#if step === 2}
				<section class="card preset-filled-surface-50-950 space-y-4 p-5">
					<div>
						<h2>What are you working on?</h2>
						<p class="mt-0.5 text-sm opacity-50">
							We'll suggest suitable hardware defaults based on your stage.
						</p>
					</div>

					{#if config === null && !configError}
						<p class="text-sm opacity-40">Loading…</p>
					{:else if config}
						<div class="flex flex-row flex-wrap gap-3">
							{#each config.stages as stage (stage.id)}
								{@const Icon = stageIcons[stage.id] ?? Zap}
								{@const isSelected = selectedStage?.id === stage.id}
								{@const hasSettings = stageHasSettings(stage)}
								<div
									class="relative h-44 w-40 shrink-0 transition-transform duration-200"
									style={isSelected ? 'transform:scale(1.05); z-index:10;' : ''}
								>
									<FlipCard flipped={isSelected && hasSettings}>
										{#snippet front()}
											<button
												type="button"
												class="card h-full w-full cursor-pointer overflow-hidden border border-surface-200-800 preset-filled-surface-100-900 hover:border-primary-400 dark:hover:border-primary-600"
												onclick={() => { selectStage(stage); if (!hasSettings) next(); }}
											>
												<div class="flex h-full flex-col items-center justify-center gap-2 p-3">
													<Icon class="h-7 w-7" />
													<span class="text-center text-sm font-semibold">{stage.label}</span>
													<span class="text-center text-[11px] leading-snug opacity-60"
														>{stage.description}</span
													>
												</div>
											</button>
										{/snippet}
										{#snippet back()}
											<div
												class="card flex h-full w-full flex-col overflow-hidden border preset-filled-surface-100-900 preset-outlined-primary-500"
											>
												<div
													class="flex items-center justify-between border-b border-surface-200-800 px-3 py-2"
												>
													<span class="text-xs font-semibold">{stage.label}</span>
													<button
														type="button"
														class="text-[10px] opacity-50 hover:opacity-100"
														onclick={unselectStage}
													>Change</button>
												</div>
												<div class="flex-1 overflow-y-auto p-2">
													{#if stage.sub_questions?.length}
														{#each stage.sub_questions as q (q.id)}
															<p class="mb-1 text-[10px] font-medium opacity-70">{q.label}</p>
															<div class="mb-2 flex flex-col gap-1">
																{#each q.options as opt}
																	<button
																		type="button"
																		class="rounded px-2 py-1 text-left text-[10px] leading-tight {subAnswers[
																			q.id
																		] === opt.label
																			? 'preset-filled-primary-500'
																			: 'preset-tonal'}"
																		onclick={() =>
																			selectSubAnswer(
																				q.id,
																				opt.label,
																				opt.hardware_overrides as Record<string, unknown>
																			)}
																	>{opt.label}</button>
																{/each}
															</div>
														{/each}
													{:else}
														<p class="text-[10px] leading-relaxed opacity-60">
															{stage.hardware_defaults.cpus} CPUs · {stage.hardware_defaults
																.ram_gb}GB RAM{stage.hardware_defaults.gpu
																? ` · ${stage.hardware_defaults.gpu}`
																: ''} · {stage.hardware_defaults.time}
														</p>
													{/if}
												</div>
											</div>
										{/snippet}
									</FlipCard>
								</div>
							{/each}
						</div>
					{/if}
				</section>
			{/if}

			<!-- Step 3: Interface -->
			{#if step === 3}
				<section class="card preset-filled-surface-50-950 space-y-4 p-5">
					<div>
						<h2>How do you want to connect?</h2>
						<p class="mt-0.5 text-sm opacity-50">
							This determines whether we generate an <code>srun</code> or <code>sbatch</code> command.
						</p>
					</div>

					{#if config === null && !configError}
						<p class="text-sm opacity-40">Loading…</p>
					{:else if config}
						<div class="flex flex-row flex-wrap gap-3">
							{#each config.interfaces as iface (iface.id)}
								{@const Icon = interfaceIcons[iface.id] ?? Terminal}
								{@const isSelected = selectedInterface?.id === iface.id}
								{@const hasSettings = ifaceHasSettings(iface)}
								<div
									class="relative h-48 w-40 shrink-0 transition-transform duration-200"
									style={isSelected ? 'transform:scale(1.05); z-index:10;' : ''}
								>
									<FlipCard flipped={isSelected && hasSettings}>
										{#snippet front()}
											<button
												type="button"
												class="card h-full w-full cursor-pointer overflow-hidden border border-surface-200-800 preset-filled-surface-100-900 hover:border-primary-400 dark:hover:border-primary-600"
												onclick={() => { selectInterface(iface); if (!hasSettings) next(); }}
											>
												<div class="flex h-full flex-col items-center justify-center gap-2 p-3">
													<Icon class="h-7 w-7" />
													<span class="text-center text-sm font-semibold">{iface.label}</span>
													<span class="text-center text-[11px] leading-snug opacity-60"
														>{iface.description}</span
													>
												</div>
											</button>
										{/snippet}
										{#snippet back()}
											<div
												class="card flex h-full w-full flex-col overflow-hidden border preset-filled-surface-100-900 preset-outlined-primary-500"
											>
												<div
													class="flex items-center justify-between border-b border-surface-200-800 px-3 py-2"
												>
													<span class="text-xs font-semibold">{iface.label}</span>
													<button
														type="button"
														class="text-[10px] opacity-50 hover:opacity-100"
														onclick={unselectInterface}
													>Change</button>
												</div>
												<div class="flex-1 overflow-y-auto p-2 space-y-2">
													{#if iface.software_id === 'ssh'}
														<div>
															<p class="mb-0.5 text-[10px] opacity-60">Port</p>
															<input
																type="number"
																class="input w-full px-2 py-0.5 text-xs"
																min="1024"
																max="65535"
																bind:value={(softwareOptions as {port: number}).port}
															/>
														</div>
														<div>
															<p class="mb-0.5 text-[10px] opacity-60">Password</p>
															<input
																type="text"
																class="input w-full px-2 py-0.5 text-xs"
																placeholder="optional"
																bind:value={(softwareOptions as {password: string}).password}
															/>
														</div>
													{:else if iface.software_id === 'jupyter'}
														<div>
															<p class="mb-0.5 text-[10px] opacity-60">Port</p>
															<input
																type="number"
																class="input w-full px-2 py-0.5 text-xs"
																min="1024"
																max="65535"
																bind:value={(softwareOptions as {port: number}).port}
															/>
														</div>
														<div>
															<p class="mb-0.5 text-[10px] opacity-60">Directory</p>
															<input
																type="text"
																class="input w-full px-2 py-0.5 font-mono text-xs"
																bind:value={(softwareOptions as {dir: string}).dir}
															/>
														</div>
													{:else}
														<p class="text-[10px] leading-relaxed opacity-60">No extra options needed.</p>
													{/if}
												</div>
											</div>
										{/snippet}
									</FlipCard>
								</div>
							{/each}
						</div>
					{/if}
				</section>
			{/if}

			<!-- Step 4: Hardware -->
			{#if step === 4}
				<section class="card preset-filled-surface-50-950 space-y-4 p-5">
					<div>
						<h2>How much compute?</h2>
						<p class="mt-0.5 text-sm opacity-50">
							Defaults are set based on your stage. Request only what you need — over-requesting
							increases queue wait times.
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

			<!-- Step 5: Container -->
			{#if step === 5}
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

			<!-- Step 6: Command -->
			{#if step === 6}
				<section class="card preset-filled-surface-50-950 space-y-4 p-5">
					<div class="flex items-center justify-between gap-4">
						<div>
							<h2>Your {buildContext.jobType === 'sbatch' ? 'job script' : 'command'}</h2>
							<p class="mt-0.5 text-sm opacity-50">
								{#if buildContext.jobType === 'sbatch'}
									Save this as a <code>.sh</code> file and submit with <code>sbatch job.sh</code>.
								{:else}
									Run this on the login node. The job starts immediately in the terminal.
								{/if}
							</p>
						</div>
						<label class="flex shrink-0 cursor-pointer items-center gap-2 text-sm">
							<input class="checkbox" type="checkbox" bind:checked={debugMode} />
							<span>Debug mode</span>
						</label>
					</div>

					{#if command}
						<AnnotatedCodeBlock {command} />
					{:else}
						<p class="text-sm opacity-40">No software selected.</p>
					{/if}
				</section>

				{#if connectInstructions}
					<section class="card preset-filled-surface-50-950 space-y-3 p-5">
						<h2>How to connect</h2>
						<CodeBlock code={connectInstructions} lang="bash" />
					</section>
				{/if}

				<!-- Settings panel -->
				<section class="card preset-filled-surface-50-950 overflow-hidden">
					<button
						type="button"
						class="flex w-full items-center justify-between gap-2 p-5"
						onclick={() => (settingsOpen = !settingsOpen)}
					>
						<span class="flex items-center gap-2 font-semibold">
							<Settings size="16" />
							Settings
						</span>
						<ChevronRight
							size="16"
							class="transition-transform {settingsOpen ? 'rotate-90' : ''}"
						/>
					</button>

					{#if settingsOpen}
						<div class="space-y-5 border-t border-surface-200-800 p-5">
							<!-- Account -->
							<div>
								<h3 class="mb-2 text-sm font-semibold opacity-70">Account</h3>
								<div class="input-group grid-cols-[auto_1fr]">
									<div class="ig-cell justify-start preset-tonal">Project</div>
									<input class="ig-input" type="text" bind:value={project} />
								</div>
							</div>

							<!-- Hardware -->
							<div>
								<h3 class="mb-2 text-sm font-semibold opacity-70">Hardware</h3>
								<div class="input-group grid-cols-[auto_auto_1fr_auto]">
									<div class="ig-cell col-span-2 justify-start preset-tonal">RAM</div>
									<input class="ig-input" type="range" min="4" max="256" step="4" bind:value={ramgb} />
									<div class="ig-cell w-20 justify-center preset-tonal">{ramgb} GB</div>

									<div class="ig-cell col-span-2 justify-start preset-tonal">CPU</div>
									<input class="ig-input" type="range" min="1" max="32" step="1" bind:value={cpupertask} />
									<div class="ig-cell w-20 justify-center preset-tonal">{cpupertask} cores</div>
								</div>
								<div class="input-group mt-1 grid-cols-[auto_1fr]">
									<div class="ig-cell justify-start preset-tonal">GPU</div>
									<select class="ig-select" bind:value={gres}>
										<option value="">None (CPU only)</option>
										<option value="2g.10gb">A-100 quarter slice (10 GB VRAM)</option>
										<option value="3g.20gb">A-100 half slice (20 GB VRAM)</option>
										<option value="ampere">A-100 full (40 GB VRAM)</option>
										<option value="hopper">H-100 full (95 GB VRAM)</option>
									</select>

									<div class="ig-cell justify-start preset-tonal">Time limit</div>
									<select class="ig-select" bind:value={timeLimit}>
										<option value="">No limit</option>
										<option value="1:00:00">1 hour</option>
										<option value="4:00:00">4 hours</option>
										<option value="8:00:00">8 hours</option>
										<option value="1-00:00:00">1 day</option>
										<option value="3-00:00:00">3 days</option>
										<option value="7-00:00:00">1 week</option>
									</select>

									<div class="ig-cell justify-start preset-tonal">Partition</div>
									<input class="ig-input" type="text" bind:value={partition} placeholder="Default" />

									<div class="ig-cell justify-start preset-tonal">Job name</div>
									<input class="ig-input" type="text" bind:value={jobName} placeholder="Optional" />
								</div>
							</div>

							<!-- Container -->
							<div>
								<h3 class="mb-2 text-sm font-semibold opacity-70">Container</h3>
								<div class="input-group grid-cols-[auto_1fr]">
									<div class="ig-cell justify-start preset-tonal">Image</div>
									<input class="ig-input font-mono text-sm" type="text" bind:value={baseimage} />

									<div class="ig-cell justify-start preset-tonal">Mounts</div>
									<input
										class="ig-input font-mono text-sm"
										type="text"
										bind:value={containerMounts}
										placeholder="/data:/data,/scratch:/scratch"
									/>

									<div class="ig-cell justify-start preset-tonal">Options</div>
									<div class="ig-cell flex-col items-start gap-2">
										<label class="flex cursor-pointer items-center gap-2">
											<input class="checkbox" type="checkbox" bind:checked={flags.writable} />
											<span>Writable filesystem</span>
										</label>
										<label class="flex cursor-pointer items-center gap-2">
											<input class="checkbox" type="checkbox" bind:checked={flags.remaproot} />
											<span>Remap to root</span>
										</label>
									</div>
								</div>
							</div>

							<!-- Software options -->
							{#if selectedSoftware}
								{@const OptionsComponent = selectedSoftware.OptionsComponent}
								<div>
									<h3 class="mb-2 text-sm font-semibold opacity-70">{selectedSoftware.label} options</h3>
									<OptionsComponent options={softwareOptions} />
								</div>
							{/if}
						</div>
					{/if}
				</section>
			{/if}
			</div>
		{/key}
		<!-- Navigation -->
		<div class="flex items-center justify-between">
			{#if step > (hasProjectFromUrl ? 2 : 1)}
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
