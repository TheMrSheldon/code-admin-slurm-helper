<script lang="ts" module>
  import { createHighlighterCoreSync } from 'shiki/core';
  import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
  import console from 'shiki/langs/console.mjs';
  import css from 'shiki/langs/css.mjs';
  import html from 'shiki/langs/html.mjs';
  import js from 'shiki/langs/javascript.mjs';
  import themeDarkPlus from 'shiki/themes/dark-plus.mjs';

  const shiki = createHighlighterCoreSync({
    engine: createJavaScriptRegexEngine(),
    themes: [themeDarkPlus],
    langs: [console, html, css, js],
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
  class="{base} {rounded} {shadow} {classes} {preBase} {prePadding} {preClasses}
         bg-surface-100 dark:bg-surface-800 relative"
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
    class="code-wrapper"
  >
    {@html shiki.codeToHtml(code, {
      lang,
      theme,
    })}
  </div>
</div>
