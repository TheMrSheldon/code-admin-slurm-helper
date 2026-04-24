export type { SoftwareType, SoftwareDefinition, SharedOptions } from './types';

import BashOptions, { bash as bashDef } from './bash.svelte';
import VscodeOptions, { vscode as vscodeDef } from './vscode.svelte';
import JupyterOptions, { jupyter as jupyterDef } from './jupyter.svelte';
import SshOptions, { ssh as sshDef } from './ssh.svelte';
import type { SoftwareType } from './types';

/**
 * Registry of all available software types.
 * To add a new entry: create a <name>.svelte file in this directory,
 * then import and add it here.
 */
export const SOFTWARE_TYPES: SoftwareType[] = [
	{ ...bashDef, OptionsComponent: BashOptions },
	{ ...vscodeDef, OptionsComponent: VscodeOptions },
	{ ...jupyterDef, OptionsComponent: JupyterOptions },
	{ ...sshDef, OptionsComponent: SshOptions }
];
