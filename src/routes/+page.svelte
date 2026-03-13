<script lang="ts">
	import CodeBlock from '$lib/components/code-block.svelte';
	import { Collapsible } from '@skeletonlabs/skeleton-svelte';
	import { MessageCircleQuestionMarkIcon } from '@lucide/svelte';
	import SoftwarePicker from '$lib/components/software-picker.svelte';
	import { isNoneTheme } from 'shiki';

	// ubuntu:24.04
	let baseimage = 'pytorch/pytorch:2.8.0-cuda12.9-cudnn9-runtime';
	let cpupertask = 2;
	let ramgb = 32;
	let gres = '2g.10gb';
	let port = 1234;
	let password = '';
	let flags = {
		writable: true,
		remaproot: true
	};
	let vscode = {
		extensions: ''
	};

	let selectedSoftware: any = null;

	function getCommand() {
		let command = 'srun';
		command += ` \\\n\t--container-image=${baseimage}`; // TODO: add string-escape?
		command += ` \\\n\t--mem=${ramgb}g`;
		command += ` \\\n\t--cpus-per-task=${cpupertask}`;
		if (gres) command += ` \\\n\t--gres=gpu:${gres}:1`;
		if (flags.writable) command += ` \\\n\t--container-writable`;
		if (flags.remaproot) command += ` \\\n\t--container-remap-root`;
		let entrypoint = `--pty bash -c 'apt-get update; apt-get install -y curl; curl -fsSL https://code-server.dev/install.sh | sh; code-server --bind-addr 0.0.0.0:${port} --auth none --disable-telemetry --cert'`;
		command += ` \\\n\t${entrypoint}`;
		return command;
	}
</script>

<div class="mx-auto max-w-screen md:max-w-2xl">
	<h1>VSCode Server using Slurm</h1>

	<form class="w-full space-y-8">
		<div>
			<h2>Hardware</h2>
			<div class="input-group grid-cols-[auto_auto_1fr_auto]">
				<!-- RAM -->
				<Collapsible class="col-span-4 grid grid-cols-subgrid">
					<div class="mb-0 ig-cell justify-start preset-tonal">RAM</div>
					<Collapsible.Trigger class="mb-0 ig-btn preset-tonal p-0"
						><MessageCircleQuestionMarkIcon class="h-4" /></Collapsible.Trigger
					>
					<input
						class="mb-0 ig-input"
						type="range"
						min="10"
						value={ramgb}
						on:input={function (e) {
							ramgb = e.target.value;
						}}
						max="100"
					/>
					<div class="mb-0 ig-cell preset-tonal">{ramgb} GB</div>
					<Collapsible.Content class="col-span-4 preset-tonal-primary px-4 py-1">
						Some explanatory text about RAM.
					</Collapsible.Content>
				</Collapsible>

				<!-- GPU -->
				<Collapsible class="col-span-4 grid grid-cols-subgrid">
					<div class="mb-0 ig-cell justify-start preset-tonal">GPU</div>
					<Collapsible.Trigger class="mb-0 ig-btn preset-tonal p-0"
						><MessageCircleQuestionMarkIcon class="h-4" /></Collapsible.Trigger
					>
					<select
						class="col-span-2 mb-0 ig-select"
						value={gres}
						on:input={function (e) {
							gres = e.target.value;
						}}
					>
						<option value="">None</option>
						<option value="2g.10gb">Quarter a A-100 (10 GB VRAM)</option>
						<option value="3g.20gb">Half a A-100 (20 GB VRAM)</option>
						<option value="ampere">A-100 (40 GB VRAM)</option>
						<option value="hopper">H-100 (95 GB VRAM)</option>
					</select>
					<Collapsible.Content class="col-span-4 preset-tonal-primary px-4 py-1">
						Some explanatory text about what GPUs to choose.
					</Collapsible.Content>
				</Collapsible>

				<!-- CPU -->
				<Collapsible class="col-span-4 grid grid-cols-subgrid">
					<div class="mb-0 ig-cell justify-start preset-tonal">CPU</div>
					<Collapsible.Trigger class="mb-0 ig-btn preset-tonal p-0"
						><MessageCircleQuestionMarkIcon class="h-4" /></Collapsible.Trigger
					>
					<input
						class="mb-0 ig-input"
						type="range"
						min="1"
						value={cpupertask}
						on:input={function (e) {
							cpupertask = e.target.value;
						}}
						max="32"
					/>
					<div class="mb-0 ig-cell preset-tonal">{cpupertask} Cores</div>
					<Collapsible.Content class="col-span-4 preset-tonal-primary px-4 py-1">
						Some explanatory text about CPU.
					</Collapsible.Content>
				</Collapsible>
			</div>
		</div>

		<div>
			<h2>Container</h2>
			<div class="input-group grid-cols-[auto_1fr]">
				<!-- Base Image -->
				<div class="ig-cell justify-start preset-tonal">Base Image</div>
				<input
					class="ig-input"
					type="text"
					value={baseimage}
					on:input={function (e) {
						baseimage = e.target.value;
					}}
				/>
				<!-- Container Writable -->
				<div class="ig-cell justify-start preset-tonal">Flags</div>
				<div class="ig-cell">
					<label class="flex items-center space-x-2">
						<input
							class="checkbox"
							type="checkbox"
							checked={flags.writable}
							on:input={function (e) {
								flags.writable = e.target.checked;
							}}
						/>
						<p>Container Writable</p>
					</label>
					<label class="flex items-center space-x-2">
						<input
							class="checkbox"
							type="checkbox"
							checked={flags.remaproot}
							on:input={function (e) {
								flags.remaproot = e.target.checked;
							}}
						/>
						<p>Remap Root</p>
					</label>
				</div>
			</div>
		</div>

		<div>
			<h2>Software</h2>
			<SoftwarePicker
				selected={selectedSoftware}
				setSelected={(item) => {
					selectedSoftware = item;
				}}
			>
				{#if selectedSoftware == null}
					<span>Select a software</span>
				{:else if selectedSoftware.id == 'bash'}
					<div class="input-group grid-cols-[auto_1fr]">
						<div class="ig-cell justify-start preset-tonal">Command</div>
                        <input class="ig-input" type="text" placeholder="source ~/.bashrc" />

						<div class="ig-cell justify-start preset-tonal">Interactive</div>
                        <input class="checkbox" type="checkbox" checked/>
                    </div>
				{:else if selectedSoftware.id == 'vscode'}
					<div class="input-group grid-cols-[auto_1fr]">
						<!-- Port -->
						<div class="ig-cell justify-start preset-tonal">Port</div>
						<input
							class="ig-input"
							type="number"
							min="10"
							max="65535"
							value={port}
							on:input={function (e) {
								port = e.target.value;
							}}
						/>

						<!-- Password -->
						<div class="ig-cell justify-start preset-tonal">Password</div>
						<input
							class="ig-input"
							type="text"
							value={password}
							on:input={function (e) {
								password = e.target.value;
							}}
							placeholder="No Password"
						/>

						<!-- Extensions -->
						<div class="ig-cell justify-start preset-tonal">Extensions</div>
						<input
							class="ig-input"
							type="text"
							value={vscode.extensions}
							on:input={function (e) {
								vscode.extensions = e.target.value;
							}}
							placeholder=""
						/>
					</div>
				{:else if selectedSoftware.id == 'jupyter'}
					<div class="input-group grid-cols-[auto_1fr]">
                        <label class="label">Notebook Directory</label>
                        <input class="input" type="text" placeholder="/workspace" />

                        <label class="label">Enable Token Auth</label>
                        <input type="checkbox" class="toggle" />
					</div>
				{:else if selectedSoftware.id == 'ssh'}
					<div class="input-group grid-cols-[auto_1fr]">
						<!-- Port -->
						<div class="ig-cell justify-start preset-tonal">Port</div>
						<input
							class="ig-input"
							type="number"
							min="10"
							max="65535"
							value={port}
							on:input={function (e) {
								port = e.target.value;
							}}
						/>

						<!-- Password -->
						<div class="ig-cell justify-start preset-tonal">Password</div>
						<input
							class="ig-input"
							type="text"
							value={password}
							on:input={function (e) {
								password = e.target.value;
							}}
							placeholder="No Password"
						/>

						<!-- Extensions -->
						<div class="ig-cell justify-start preset-tonal">Extensions</div>
						<input
							class="ig-input"
							type="text"
							value={vscode.extensions}
							on:input={function (e) {
								vscode.extensions = e.target.value;
							}}
							placeholder=""
						/>
					</div>
				{/if}
			</SoftwarePicker>
		</div>
	</form>

	<div class="pt-10">
		<h2>Copy this into your Terminal</h2>
		<CodeBlock base="overflow-auto" code={getCommand()} lang="bash" />
	</div>
</div>

<!---
1. Timelimit (inactivity)
2. Mit KB image bauen (base image und svelte)? Von KB verlinken; In Svelte kann immer das recommended image eingestellt werden
3. Jupyter Notebook per default
4. Homedirectory
5. Eigenes Image (in service directory) mit settings (zb Autosave) & Extension (zB.: Python)
6. Andere Usecases (zB Jupyter; Nur Console; sbatch statt srun)
-->
