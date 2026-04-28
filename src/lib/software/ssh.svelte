<script module lang="ts">
	import { Server } from '@lucide/svelte';
	import type { SoftwareDefinition, AnnotatedCommand } from './types';
	import { buildBaseSegments } from './builder';

	export const ssh: SoftwareDefinition = {
		id: 'ssh',
		label: 'SSH Server',
		icon: Server,
		description: 'Connect with your own IDE',
		defaultOptions: {
			port: 1234,
			password: 'changeme',
			publicKey: '',
			sftp: false
		},
		buildCommand(ctx, { port, password, publicKey, sftp }): AnnotatedCommand {
			const segments = buildBaseSegments(ctx);

			const authSteps: string[] = [];
			if (password) authSteps.push(`usermod -p "$(openssl passwd -6 '${password}')" root`);
			if ((publicKey as string).trim())
				authSteps.push(
					`mkdir -p /root/.ssh && ` +
						`echo "${(publicKey as string).trim()}" >> /root/.ssh/authorized_keys && ` +
						`chmod 700 /root/.ssh && chmod 600 /root/.ssh/authorized_keys`
				);

			// openssh-server fails in remapped-root containers: after privsep drops to the sshd
			// system user, it verifies CAP_SETGID is gone — but container root retains it, so
			// the security check kills the connection. Dropbear has no privsep and works fine.
			const hostKey = '"$HOME/.cache/webis-slurm-tool/ssh/dropbear_ed25519_host_key"';
			// -v adds per-connection verbose logging in debug mode
			const dropbearCmd = `exec dropbear -F -E${ctx.debugMode ? ' -v' : ''} -p ${port} -r ${hostKey}`;

			const installStep = [
				ctx.debugMode ? 'set -x' : null,
				'apt-get update -qq',
				`apt-get install -y -qq dropbear libpam-sss${sftp ? ' openssh-sftp-server' : ''}`
			]
				.filter((s) => s !== null)
				.join(' && \\\n\t\t');

			const authCopyStep =
				// Under --container-remap-root $HOME may be remapped to /root, so we resolve
				// the real cluster home via getent using $SLURM_JOB_USER (always set by Slurm).
				'_rh=$(getent passwd "$SLURM_JOB_USER" 2>/dev/null | cut -d: -f6); ' +
				'mkdir -p /root/.ssh; ' +
				'cp "${_rh:-$HOME}/.ssh/authorized_keys" /root/.ssh/authorized_keys 2>/dev/null; ' +
				'chmod 700 /root/.ssh; chmod 600 /root/.ssh/authorized_keys 2>/dev/null; true';

			// Host key is persisted in $HOME so the client's known_hosts entry stays valid
			// across job restarts, avoiding "REMOTE HOST IDENTIFICATION HAS CHANGED" warnings.
			const hostKeyStep = `mkdir -p "$HOME/.cache/webis-slurm-tool/ssh" && { [ -f ${hostKey} ] || dropbearkey -t ed25519 -f ${hostKey}; }`;

			const readyStep = `printf "\\n\\033[1;32m=== SSH ready: root@%s port ${port} ===\\033[0m\\n\\n" "$(hostname)"`;
			const vscodeStep = `_vsc_url="vscode://vscode-remote/ssh-remote+root@$(hostname).medien.uni-weimar.de:${port}$HOME" && printf "Open in VSCode: \\033[1;36m\\033]8;;%s\\033\\\\\\\\%s\\033]8;;\\033\\\\\\\\\\033[0m\\n\\n" "$_vsc_url" "$_vsc_url"`;

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
							"Installs the Dropbear SSH server. We use Dropbear instead of OpenSSH because OpenSSH's privilege separation fails inside --container-remap-root containers (capability check conflict). Dropbear has no privsep and works reliably."
					}
				},
				{
					code: ` && \\\n\t\t${authCopyStep}`,
					annotation: {
						title: 'Copy cluster SSH keys',
						description:
							'Copies your existing cluster SSH public keys into the container so you can log in without a password. Uses $SLURM_JOB_USER to find your real home directory (since --container-remap-root remaps $HOME to /root).'
					}
				}
			);

			if (authSteps.length > 0) {
				segments.push({
					code: ` && \\\n\t\t${authSteps.join(' && \\\n\t\t')}`,
					annotation: {
						title: 'Authentication setup',
						description:
							'Sets up the password and/or public key you configured above. Password is hashed with SHA-512 (openssl passwd -6) before being written.'
					}
				});
			}

			segments.push(
				{
					code: ` && \\\n\t\t${hostKeyStep}`,
					annotation: {
						title: 'Persist host key',
						description:
							"Generates and caches the server's Ed25519 host key in your home directory. Reusing the same key across job restarts prevents 'REMOTE HOST IDENTIFICATION HAS CHANGED' warnings in your SSH client."
					}
				},
				{
					code: ` && \\\n\t\t${readyStep}`,
					annotation: {
						title: 'Ready message',
						description:
							'Prints a colored banner to the terminal showing the compute node hostname and port. Look for this to know when the SSH server is ready to accept connections.'
					}
				},
				{
					code: ` && \\\n\t\t${vscodeStep}`,
					annotation: {
						title: 'VSCode deep link',
						description:
							'Prints a clickable VSCode Remote SSH URL. Clicking it opens VSCode directly connected to the compute node — no manual host configuration needed.'
					}
				},
				{
					code: ` && \\\n\t\t${dropbearCmd}\n\t'`,
					annotation: {
						title: 'Start SSH server',
						description:
							'-F keeps Dropbear in the foreground (so the job stays alive), -E logs to stderr, -p sets the port, and -r specifies the host key file.'
					}
				}
			);

			return { jobType: 'srun', segments };
		},
		buildConnectInstructions({ port }) {
			return (
				`# 1. Note the compute node hostname printed in the terminal (e.g. === SSH ready: root@gammaweb06 port 1234 ===)\n` +
				`# 2. Connect as root (Slurm maps you to root inside the container):\n` +
				`#    Your existing cluster SSH keys are copied in automatically.\n` +
				`ssh root@COMPUTE_NODE -p ${port}\n`
			);
		}

		/** Connect via VSCode:
		 *  1. UI
		 *     - Strg+Shift+P: `>Remote-SSH: Connect to Host...`
		 *     - Enter root@<NODE>.medien.uni-weimar.de:<PORT>; Enter password when prompted
		 *  2. CLI
		 *     - E.g., code --remote ssh-remote+root@gammaweb06.medien.uni-weimar.de:1234 /mnt/ceph/storage/data-tmp/current/thagen
		 *  3. URL
		 *     - Click on the link that is printed to the console
		*/
	};
</script>

<script lang="ts">
	let { options }: { options: { port: number; password: string; publicKey: string; sftp: boolean } } = $props();
</script>

<div class="input-group grid-cols-[auto_1fr]">
	<div class="ig-cell justify-start preset-tonal">Port</div>
	<input class="ig-input" type="number" min="1024" max="65535" bind:value={options.port} />

	<div class="ig-cell justify-start preset-tonal">Password</div>
	<input
		class="ig-input"
		type="text"
		bind:value={options.password}
		placeholder="Leave empty to disable password auth"
	/>

	<div class="ig-cell justify-start preset-tonal">Public Key</div>
	<input
		class="ig-input font-mono text-xs"
		type="text"
		bind:value={options.publicKey}
		placeholder="ssh-ed25519 AAAA… (optional, added alongside password)"
	/>

	<div class="ig-cell justify-start preset-tonal">SFTP</div>
	<label class="ig-cell gap-2">
		<input type="checkbox" class="checkbox" bind:checked={options.sftp} />
		<span class="text-sm">Install SFTP server (required for VSCode Remote)</span>
	</label>
</div>
