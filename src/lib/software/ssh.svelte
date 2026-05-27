<script module lang="ts">
	import { Server } from '@lucide/svelte';
	import type { SoftwareDefinition, AnnotatedCommand } from './types';
	import { buildBaseSegments } from './builder';

	function applyTemplate(tmpl: string, portStr: string): string {
		return tmpl
			.replace(/{hostname}/g, '$(hostname)')
			.replace(/{port}/g, portStr)
			.replace(/{home}/g, '$HOME');
	}

	function generateRandomPassword(): string {
		const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
		const array = new Uint8Array(10);
		crypto.getRandomValues(array);
		return Array.from(array, (b) => chars[b % chars.length]).join('');
	}

	export const ssh: SoftwareDefinition = {
		id: 'ssh',
		label: 'SSH Server',
		icon: Server,
		description: 'Connect with your own IDE',
		defaultOptions: {
			port: null as number | null,
			authentication: 'gitlab-keys' as 'gitlab-keys' | 'password',
			password: generateRandomPassword(),
			// String templates — empty string means "don't show this step".
			// Configure per interface via software_option_overrides in interfaces.yaml.
			ready_message: '',
			pycharm_message: ''
		},
		buildCommand(ctx, { port, ready_message, pycharm_message, authentication, password }): AnnotatedCommand {
			const segments = buildBaseSegments(ctx);
			const p = port as number | null;
			const randomPort = !p;
			// When no port is configured, pick one at runtime and refer to it as $_port.
			const portStr = randomPort ? '$_port' : String(p);

			// OpenSSH cannot run inside --container-remap-root:
			// its privilege-separation monitor verifies CAP_SETGID is gone after dropping to the
			// unprivileged sshd user, but the container root retains it (user-namespace behaviour).
			// UsePrivilegeSeparation=no was deprecated in OpenSSH 7.5 and is ignored in 8.x+,
			// so the check cannot be bypassed via configuration alone.
			// Dropbear has no privilege separation and works reliably in this environment.
			const hostKey = '"$HOME/.cache/webis-slurm-tool/ssh/dropbear_ed25519_host_key"';
			const dropbearCmd = `exec dropbear -F -E${ctx.debugMode ? ' -v' : ''} -p ${portStr} -r ${hostKey} -D /tmp/authorized_keys`;

			const installStep = [
				ctx.debugMode ? 'set -x' : null,
				'apt-get update -qq',
				'apt-get install -y -qq dropbear'
			]
				.filter((s) => s !== null)
				.join(' && \\\n\t\t');

			// Fetch authorized keys at startup and write to a temp file.
			// $SLURM_JOB_USER is set by SLURM to the submitting user's username.
			const fetchKeysStep = '/bin/fetchgitlabkeys "$SLURM_JOB_USER" > /tmp/authorized_keys';

			// Host key is persisted in $HOME so the client's known_hosts entry stays valid
			// across job restarts, avoiding "REMOTE HOST IDENTIFICATION HAS CHANGED" warnings.
			const hostKeyStep = `mkdir -p "$HOME/.cache/webis-slurm-tool/ssh" && { [ -f ${hostKey} ] || dropbearkey -t ed25519 -f ${hostKey}; }`;

			segments.push(
				{
					code: ` \\\n\t--ntasks=1`,
					annotation: {
						title: 'Single task',
						description:
							'The SSH server only needs one task. SLURM jobs can run multiple parallel tasks; here we explicitly request just one.'
					}
				},
				{
					code: ` \\\n\t--pty bash -c '\n\t\t`,
					annotation: {
						title: 'Pseudo-terminal shell',
						description:
							'Allocates a pseudo-terminal (--pty) and runs a bash script inline. The -c flag passes the script as a string. --pty is needed so the terminal stays alive while the SSH server runs.'
					}
				},
				{
					code: installStep,
					annotation: {
						title: 'Install Dropbear SSH',
						description:
							'Installs the Dropbear SSH server. OpenSSH cannot run inside --container-remap-root: its privilege-separation monitor checks that CAP_SETGID is gone after dropping privileges, but the container root retains it due to user-namespace behaviour, and UsePrivilegeSeparation=no was removed in OpenSSH 8.x. Dropbear has no privilege separation and works reliably.'
					}
				},
				{
					code:
						authentication === 'password'
							? ` && \\\n\t\ttouch /tmp/authorized_keys && echo "root:${password}" | chpasswd`
							: ` && \\\n\t\t${fetchKeysStep}`,
					annotation:
						authentication === 'password'
							? {
									title: 'Set root password',
									description:
										'Creates an empty authorized_keys file (disabling public-key auth) and sets the root user password via chpasswd. Connect with ssh root@HOST -p PORT and the password shown below.'
								}
							: {
									title: 'Fetch authorized keys',
									description:
										'Calls fetchgitlabkeys (mounted from the host) with $SLURM_JOB_USER — the SLURM-provided username of the job owner — and writes the result to /tmp/authorized_keys. Dropbear is told to read keys from this path via -D.'
								}
				}
			);

			if (randomPort) {
				segments.push({
					code: ` && \\\n\t\t_port=$(shuf -i 1025-65535 -n 1)`,
					annotation: {
						title: 'Random port',
						description:
							'Picks a random unprivileged port for the SSH server. The chosen port is printed by the ready message below — look for it in the terminal output.'
					}
				});
			}

			segments.push({
				code: ` && \\\n\t\t${hostKeyStep}`,
				annotation: {
					title: 'Persist host key',
					description:
						"Generates and caches the server's Ed25519 host key in your home directory. Reusing the same key across job restarts prevents 'REMOTE HOST IDENTIFICATION HAS CHANGED' warnings in your SSH client."
				}
			});

			// SLURM sets CUDA_VISIBLE_DEVICES and other GPU/job variables in the job environment,
			// but SSH sessions start a fresh shell that does not inherit them. We write the relevant
			// variables to /tmp (container-local) and register them via /etc/profile.d so every
			// SSH login shell picks them up without touching $HOME (which may be a shared filesystem).
			const slurmEnvStep =
				`{ export -p | grep -E "(SLURM_|CUDA_|NVIDIA_VISIBLE_DEVICES|ROCR_VISIBLE_DEVICES|HIP_VISIBLE_DEVICES)" > /tmp/slurm-job-env` +
				`; echo ". /tmp/slurm-job-env 2>/dev/null" > /etc/profile.d/slurm-env.sh; }`;

			segments.push({
				code: ` && \\\n\t\t${slurmEnvStep}`,
				annotation: {
					title: 'Forward SLURM environment to SSH sessions',
					description:
						'SLURM sets CUDA_VISIBLE_DEVICES (and SLURM_*, ROCR_VISIBLE_DEVICES, etc.) in the job environment, but SSH sessions start a fresh shell that does not inherit these variables. This step writes all relevant variables to /tmp/slurm-job-env (container-local, not in $HOME) and registers a source line in /etc/profile.d/slurm-env.sh so every SSH login shell automatically sees the correct GPU assignment and SLURM context.'
				}
			});

			if (ready_message) {
				const readyStep = `printf "${applyTemplate(ready_message as string, portStr)}"`;
				segments.push({
					code: ` && \\\n\t\t${readyStep}`,
					annotation: {
						title: 'Ready message',
						description:
							'Prints a colored banner to the terminal showing the compute node hostname and port. Look for this to know when the SSH server is ready to accept connections.'
					}
				});
			}

			if (pycharm_message) {
				const pycharmStep = `printf "${applyTemplate(pycharm_message as string, portStr)}"`;
				segments.push({
					code: ` && \\\n\t\t${pycharmStep}`,
					annotation: {
						title: 'PyCharm Gateway hint',
						description:
							'Prints the connection details for PyCharm Remote Development (Gateway). Open PyCharm Gateway, choose New Connection > SSH, and enter the host, port, and user shown here.'
					}
				});
			}

			segments.push({
				code: ` && \\\n\t\t${dropbearCmd}\n\t'`,
				annotation: {
					title: 'Start SSH server',
					description:
						'-F keeps Dropbear in the foreground (so the job stays alive), -E logs to stderr, -p sets the port, -r specifies the host key file, and -D specifies the authorized_keys file path.'
				}
			});

			return { jobType: 'srun', segments };
		},
		buildConnectInstructions({ port, pycharm_message, authentication, password }) {
			const p = port as number | null;
			const portDisplay = p ? String(p) : 'PORT';
			const usePassword = authentication === 'password';
			if (pycharm_message) {
				return (
					`# 1. Open JetBrains Gateway\n` +
					`# 2. Choose: New Connection > SSH\n` +
					`# 3. Enter the host and port printed in the terminal\n` +
					`#    User: root   Port: ${portDisplay}\n` +
					(usePassword
						? `#    Password: ${password}\n`
						: `# 4. Your GitLab SSH keys are used for authentication\n`)
				);
			}
			if (usePassword) {
				return (
					`# 1. Note the compute node hostname and port printed in the terminal\n` +
					`# 2. Connect as root with the password below:\n` +
					`ssh root@COMPUTE_NODE -p ${portDisplay}\n` +
					`# Password: ${password}\n`
				);
			}
			return (
				`# 1. Note the compute node hostname and port printed in the terminal\n` +
				`# 2. Connect as root (your GitLab SSH keys are used automatically):\n` +
				`ssh root@COMPUTE_NODE -p ${portDisplay}\n`
			);
		}
	};
</script>

<script lang="ts">
	import { Collapsible } from '@skeletonlabs/skeleton-svelte';
	import { Info } from '@lucide/svelte';

	let { options }: { options: { port: number | null; authentication: string; password: string } } =
		$props();
</script>

<div class="input-group grid-cols-[auto_auto_1fr]">
	<div class="ig-cell col-span-2 justify-start preset-tonal">Port</div>
	<input
		class="ig-input"
		type="number"
		min="1025"
		max="65535"
		placeholder="Random"
		value={options.port ?? ''}
		oninput={(e) => {
			const v = (e.currentTarget as HTMLInputElement).valueAsNumber;
			options.port = isNaN(v) ? null : v;
		}}
	/>

	<Collapsible class="col-span-3 grid grid-cols-subgrid">
		<div class="ig-cell justify-start preset-tonal">Authentication</div>
		<Collapsible.Trigger class="ig-btn preset-tonal p-0">
			<Info class="h-4 w-4" />
		</Collapsible.Trigger>
		<select class="ig-select" bind:value={options.authentication}>
			<option value="gitlab-keys">GitLab Public Keys</option>
			<option value="password">Password</option>
		</select>
		<Collapsible.Content class="col-span-3 preset-tonal-primary px-4 py-2 text-sm">
			<strong>GitLab Public Keys</strong> — your registered GitLab SSH keys are fetched at startup.
			You can log in the same way as on the SSH Gateway: no password required.<br /><br />
			<strong>Password</strong> — sets a password for the <code>root</code> user inside the
			container. Any SSH client can connect; no SSH key needed.
		</Collapsible.Content>
	</Collapsible>

	{#if options.authentication === 'password'}
		<div class="ig-cell col-span-2 justify-start preset-tonal">Password</div>
		<input
			class="ig-input font-mono"
			type="text"
			placeholder="alphanumeric recommended"
			bind:value={options.password}
		/>
	{/if}
</div>
