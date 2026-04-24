# Slurm Job Launcher

A small SvelteKit wizard that generates `srun` commands for interactive jobs on a Slurm cluster running Enroot/Pyxis containers.

## Developing

```sh
pnpm install
pnpm dev          # start dev server
pnpm dev --open   # … and open in browser
```

## Building

```sh
pnpm build
pnpm preview   # preview the production build locally
```

---

## Adding a new software type

Each software type lives in a **single `.svelte` file** inside [`src/lib/software/`](src/lib/software/). The file uses Svelte 5's `<script module>` block to export the static definition (metadata + command builders) alongside the component that renders the options form.

### Step 1 — Create `src/lib/software/mytool.svelte`

```svelte
<!-- src/lib/software/mytool.svelte -->

<!-- Module block: exports the static definition -->
<script module lang="ts">
  import { Wrench } from '@lucide/svelte';  // any icon from @lucide/svelte
  import type { SoftwareDefinition } from './types';

  export const mytool: SoftwareDefinition = {
    id: 'mytool',
    label: 'My Tool',
    icon: Wrench,
    description: 'Short description shown on the picker card',

    /** Initial values; reset whenever the user picks this software type */
    defaultOptions: {
      port: 8888,
      token: '',
    },

    /**
     * Returns the full srun command string.
     * @param base    - srun flags built from the Hardware/Container steps
     * @param options - current values from the options form below
     * @param shared  - { debugMode }
     */
    buildCommand(base, { port, token }, { debugMode }) {
      const dbg = debugMode ? 'set -x; ' : '';
      return (
        `${base} \\\n\t--pty bash -c ` +
        `'${dbg}pip install -q mytool; ` +
        `mytool --port=${port} --token=${token}'`
      );
    },

    /** Optional — omit if no SSH tunnel / browser URL is needed */
    buildConnectInstructions({ port }) {
      return (
        `# 1. Note the compute node hostname (e.g. gpu001)\n` +
        `# 2. Open a tunnel on your local machine:\n` +
        `ssh -L ${port}:COMPUTE_NODE:${port} YOUR_LOGIN_NODE\n` +
        `# 3. Open http://localhost:${port} in your browser`
      );
    },
  };
</script>

<!-- Instance block + template: the options form component -->
<script lang="ts">
  let { options }: { options: { port: number; token: string } } = $props();
</script>

<div class="input-group grid-cols-[auto_1fr]">
  <div class="ig-cell justify-start preset-tonal">Port</div>
  <input class="ig-input" type="number" min="1024" max="65535" bind:value={options.port} />

  <div class="ig-cell justify-start preset-tonal">Token</div>
  <input class="ig-input" type="text" bind:value={options.token} placeholder="optional" />
</div>
```

The component receives `options` (the reactive state object from the parent) and mutates it in place via `bind:value` / `bind:checked`. The `<script module>` definition and the instance component are kept together so everything about a software type is in one place.

**`SoftwareDefinition` field reference** ([`src/lib/software/types.ts`](src/lib/software/types.ts)):

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Unique identifier used internally |
| `label` | `string` | Display name on the picker card |
| `icon` | `Component` | Any icon from `@lucide/svelte` |
| `description` | `string` | Short subtitle on the picker card |
| `defaultOptions` | `Record<string, unknown>` | Initial option values; shallow-copied on selection |
| `buildCommand` | `(base, options, shared) => string` | Returns the complete `srun` command |
| `buildConnectInstructions` | `(options, shared) => string` | *(optional)* Returns connection instructions shown after the command |

### Step 2 — Register in `index.ts`

Add two lines to [`src/lib/software/index.ts`](src/lib/software/index.ts):

```ts
import MyToolOptions, { mytool as mytoolDef } from './mytool.svelte';  // add this

export const SOFTWARE_TYPES: SoftwareType[] = [
  { ...bashDef,    OptionsComponent: BashOptions },
  { ...vscodeDef,  OptionsComponent: VscodeOptions },
  { ...jupyterDef, OptionsComponent: JupyterOptions },
  { ...sshDef,     OptionsComponent: SshOptions },
  { ...mytoolDef,  OptionsComponent: MyToolOptions },  // add this
];
```

That's it. The picker card, options form, command generation, and connect instructions all wire up automatically.
