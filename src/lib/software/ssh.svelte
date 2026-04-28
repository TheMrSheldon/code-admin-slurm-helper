<script module lang="ts">
	import { Server } from '@lucide/svelte';
	import type { SoftwareDefinition } from './types';

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
		buildCommand(base, { port, password, publicKey, sftp }, { debugMode }) {
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
			const dropbearCmd = `exec dropbear -F -E${debugMode ? ' -v' : ''} -p ${port} -r ${hostKey}`;

			// TODO: export VSCODE_AGENT_FOLDER="/var/tmp/${SLURM_JOB_USER}/vscode_agent

			const steps = [
				debugMode ? 'set -x' : null,
				'apt-get update -qq',
				`apt-get install -y -qq dropbear libpam-sss${sftp ? ' openssh-sftp-server' : ''}`,
				// Under --container-remap-root $HOME may be remapped to /root, so we resolve
				// the real cluster home via getent using $SLURM_JOB_USER (always set by Slurm).
				'_rh=$(getent passwd "$SLURM_JOB_USER" 2>/dev/null | cut -d: -f6); ' +
					'mkdir -p /root/.ssh; ' +
					'cp "${_rh:-$HOME}/.ssh/authorized_keys" /root/.ssh/authorized_keys 2>/dev/null; ' +
					'chmod 700 /root/.ssh; chmod 600 /root/.ssh/authorized_keys 2>/dev/null; true',
				...authSteps,
				// Host key is persisted in $HOME so the client's known_hosts entry stays valid
				// across job restarts, avoiding "REMOTE HOST IDENTIFICATION HAS CHANGED" warnings.
				`mkdir -p "$HOME/.cache/webis-slurm-tool/ssh" && { [ -f ${hostKey} ] || dropbearkey -t ed25519 -f ${hostKey}; }`,
				`printf "\\n\\033[1;32m=== SSH ready: root@%s port ${port} ===\\033[0m\\n\\n" "$(hostname)"`,
				`_vsc_url="vscode://vscode-remote/ssh-remote+root@$(hostname).medien.uni-weimar.de:${port}$HOME" && printf "Open in VSCode: \\033[1;36m\\033]8;;%s\\033\\\\\\\\%s\\033]8;;\\033\\\\\\\\\\033[0m\\n\\n" "$_vsc_url" "$_vsc_url"`,
				dropbearCmd
			]
				.filter((s) => s !== null)
				.join(' && \\\n\t\t');

			return `${base} --ntasks=1\\\n\t--pty bash -c '\n\t\t${steps}\n\t'`;
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
