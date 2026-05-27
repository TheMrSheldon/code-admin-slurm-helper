<script lang="ts" module>
	import { createHighlighterCoreSync } from 'shiki/core';
	import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
	import langBash from 'shiki/langs/bash.mjs';
	import themeDarkPlus from 'shiki/themes/dark-plus.mjs';

	const shiki = createHighlighterCoreSync({
		engine: createJavaScriptRegexEngine(),
		themes: [themeDarkPlus],
		langs: [langBash]
	});
</script>

<script lang="ts">
	import type { AnnotatedCommand } from '$lib/software/types';
	import { flattenCommand } from '$lib/software/types';
	import { Copy, Check } from '@lucide/svelte';

	let { command }: { command: AnnotatedCommand } = $props();

	// Muted color palette — one color per unique annotation group
	const PALETTE = [
		{ bg: 'rgba(251,191,36,0.10)',  line: 'rgba(251,191,36,0.15)'  },
		{ bg: 'rgba(52,211,153,0.10)',  line: 'rgba(52,211,153,0.15)'  },
		{ bg: 'rgba(56,189,248,0.10)',  line: 'rgba(56,189,248,0.15)'  },
		{ bg: 'rgba(167,139,250,0.10)', line: 'rgba(167,139,250,0.15)' },
		{ bg: 'rgba(251,113,133,0.10)', line: 'rgba(251,113,133,0.15)' },
		{ bg: 'rgba(251,146,60,0.10)',  line: 'rgba(251,146,60,0.15)'  },
		{ bg: 'rgba(45,212,191,0.10)',  line: 'rgba(45,212,191,0.15)'  },
		{ bg: 'rgba(232,121,249,0.10)', line: 'rgba(232,121,249,0.15)' },
	];

	interface Piece {
		content: string;
		color: string;
		bg?: string;
		line?: string;
		annotation?: { title: string; description: string };
	}

	/**
	 * Returns the length of the non-highlighted shell-continuation prefix in a segment's code.
	 * e.g. " \\\n\t" (space + backslash + newline + tab) → 4 chars
	 *      "\n#SBATCH " → 9 chars
	 *      " && \\\n\t\t" → varies
	 */
	function prefixLen(code: string): number {
		const m =
			code.match(/^[ ]*\\\n\t+/) ??   // srun flag: " \\\n\t..."
			code.match(/^\n#SBATCH /) ??     // sbatch directive
			code.match(/^ && \\\n\t+/);      // shell command chaining
		return m ? m[0].length : 0;
	}

	let pieces = $derived.by((): Piece[] => {
		// 1. Build annotation title → palette index map (order of first appearance)
		const colorMap = new Map<string, number>();
		let ci = 0;
		for (const seg of command.segments) {
			if (seg.annotation && !colorMap.has(seg.annotation.title)) {
				colorMap.set(seg.annotation.title, ci++ % PALETTE.length);
			}
		}

		// 2. Compute annotation character ranges on the full code string,
		//    starting AFTER the shell continuation prefix so only the flag itself is highlighted.
		type AnnotRange = {
			start: number;
			end: number;
			annotation: { title: string; description: string };
			pal: (typeof PALETTE)[0];
		};
		const annotRanges: AnnotRange[] = [];
		let offset = 0;
		for (const seg of command.segments) {
			const len = seg.code.length;
			if (seg.annotation) {
				const pl = prefixLen(seg.code);
				annotRanges.push({
					start: offset + pl,
					end: offset + len,
					annotation: seg.annotation,
					pal: PALETTE[(colorMap.get(seg.annotation.title) ?? 0) % PALETTE.length]
				});
			}
			offset += len;
		}

		// 3. Shiki-tokenize the full command string
		const fullCode = flattenCommand(command);
		const { tokens, fg } = shiki.codeToTokens(fullCode, { lang: 'bash', theme: 'dark-plus' });
		const fallback = fg ?? '#d4d4d4';

		// 4. Walk Shiki tokens and split them at annotation boundaries
		const result: Piece[] = [];
		let charPos = 0;

		for (let li = 0; li < tokens.length; li++) {
			for (const tok of tokens[li]) {
				const tStart = charPos;
				const tEnd = charPos + tok.content.length;
				const color = tok.color ?? fallback;

				const overlapping = annotRanges.filter(r => r.start < tEnd && r.end > tStart);

				if (overlapping.length === 0) {
					result.push({ content: tok.content, color });
				} else {
					// Collect all split points within this token
					const pts = new Set([tStart, tEnd]);
					for (const r of overlapping) {
						if (r.start > tStart && r.start < tEnd) pts.add(r.start);
						if (r.end > tStart && r.end < tEnd) pts.add(r.end);
					}
					const sorted = [...pts].sort((a, b) => a - b);

					for (let i = 0; i < sorted.length - 1; i++) {
						const pStart = sorted[i];
						const pEnd = sorted[i + 1];
						const content = tok.content.slice(pStart - tStart, pEnd - tStart);
						const annot = overlapping.find(r => r.start <= pStart && r.end >= pEnd);
						if (annot) {
							result.push({ content, color, bg: annot.pal.bg, line: annot.pal.line, annotation: annot.annotation });
						} else {
							result.push({ content, color });
						}
					}
				}

				charPos = tEnd;
			}
			// Add the newline between lines (Shiki line tokens don't include it)
			if (li < tokens.length - 1) {
				result.push({ content: '\n', color: fallback });
				charPos += 1;
			}
		}

		return result;
	});

	// Tooltip — always rendered as position:fixed to avoid layout shift on hover
	let activeAnnotation = $state<{ title: string; description: string } | null>(null);
	let tipX = $state(0);
	let tipY = $state(0);

	function onEnter(e: MouseEvent, ann: { title: string; description: string }) {
		activeAnnotation = ann;
		tipX = e.clientX;
		tipY = e.clientY;
	}
	function onMove(e: MouseEvent) {
		tipX = e.clientX;
		tipY = e.clientY;
	}
	function onLeave() {
		activeAnnotation = null;
	}

	let copied = $state(false);
	function copy() {
		navigator.clipboard.writeText(flattenCommand(command)).then(() => {
			copied = true;
			setTimeout(() => (copied = false), 1500);
		});
	}
</script>

<div class="relative rounded-lg" style="background:#1E1E1E;">
	<button
		type="button"
		class="btn preset-tonal absolute top-2 right-2 z-10 gap-1.5 px-2 py-1 text-xs"
		onclick={copy}
		aria-label="Copy command"
	>
		{#if copied}<Check size="12" />Copied!{:else}<Copy size="12" />Copy{/if}
	</button>
	<!-- Single-line content prevents stray whitespace text nodes inside <pre> -->
	<pre class="overflow-x-auto rounded-lg p-4 pr-16 text-sm leading-relaxed" style="background:#1E1E1E;"><code class="font-mono">{#each pieces as p}{#if p.annotation}<span style="color:{p.color}; background:{p.bg}; border-bottom:2px solid {p.line}; border-radius:2px 2px 0 0; cursor:help;" role="note" onmouseenter={(e) => onEnter(e, p.annotation!)} onmousemove={onMove} onmouseleave={onLeave}>{p.content}</span>{:else}<span style="color:{p.color};">{p.content}</span>{/if}{/each}</code></pre>
</div>

<!--
	Tooltip is always in the DOM as position:fixed so it never affects document flow.
	Visibility is toggled via CSS to prevent layout shifts on hover.
-->
<div
	class="pointer-events-none fixed z-50 max-w-72 rounded-lg px-3 py-2.5 shadow-xl"
	style="background:#252526; border:1px solid rgba(255,255,255,0.12); left:{tipX}px; top:{tipY - 14}px; transform:translate(-50%,-100%); visibility:{activeAnnotation ? 'visible' : 'hidden'}; transition:opacity 80ms; opacity:{activeAnnotation ? 1 : 0};"
>
	<p class="text-xs font-semibold" style="color:#e2e2e2;">{activeAnnotation?.title ?? ''}</p>
	<p class="mt-0.5 text-xs leading-relaxed" style="color:#9ca3af;">{activeAnnotation?.description ?? ''}</p>
</div>
