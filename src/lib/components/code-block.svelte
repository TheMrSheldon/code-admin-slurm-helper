<script lang="ts" module>
  import { createHighlighterCoreSync } from 'shiki/core';
  import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
  import langBash from 'shiki/langs/bash.mjs';
  import langConsole from 'shiki/langs/console.mjs';
  import themeDarkPlus from 'shiki/themes/dark-plus.mjs';

  const shiki = createHighlighterCoreSync({
    engine: createJavaScriptRegexEngine(),
    themes: [themeDarkPlus],
    langs: [langConsole, langBash],
  });

  interface CodeBlockProps {
    code: string;
    lang?: string;
    theme?: string;
    // Base Style Props
    base?: string;
    background?: string;
    rounded?: string;
    shadow?: string;
    classes?: string;
    // Pre Style Props
    preBase?: string;
    prePadding?: string;
    preClasses?: string;
  }
</script>

<script lang="ts">
  import { Check, Copy } from "@lucide/svelte";

  const {
    code = "",
    lang = "console",
    theme = "dark-plus",
    base = "relative overflow-hidden",
    rounded = "rounded-container",
    shadow = "",
    classes = "",
    preBase = "",
    prePadding = "[&>pre]:p-4",
    preClasses = "",
  }: CodeBlockProps = $props();

  let copied = $state(false);

  async function copyCode() {
    await navigator.clipboard.writeText(code);
    copied = true;
    setTimeout(() => (copied = false), 1500);
  }
</script>

<!-- Wrapper -->
<div
  class="{base} {rounded} {shadow} {classes} {preBase} {prePadding} {preClasses} relative"
>

  <!-- Copy Button -->
  <button
    onclick={copyCode}
    class="absolute top-2 right-2 z-10
           btn btn-neutral btn-sm flex items-center gap-1"
    aria-label="Copy code"
  >
    {#if copied}
      <Check size="16" />
      Copied
    {:else}
      <Copy size="16" />
      Copy
    {/if}
  </button>

  <!-- Highlighted code -->
  <div
    class="code-wrapper overflow-x-auto text-xs bg-[#1E1E1E] [&>pre]:whitespace-pre [&>pre]:min-w-full"
  >
    {@html shiki.codeToHtml(code, {
      lang,
      theme,
    })}
  </div>
</div>
