<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		flipped = false,
		front,
		back
	}: {
		flipped?: boolean;
		front: Snippet;
		back: Snippet;
	} = $props();
</script>

<div class="flip-outer" class:flipped>
	<div class="flip-front">
		{@render front()}
	</div>
	<div class="flip-back">
		{@render back()}
	</div>
</div>

<style>
	.flip-outer {
		width: 100%;
		height: 100%;
		perspective: 900px;
		position: relative;
	}
	.flip-front,
	.flip-back {
		position: absolute;
		inset: 0;
		transition: transform 0.45s cubic-bezier(0.4, 0, 0.2, 1);
		backface-visibility: hidden;
		-webkit-backface-visibility: hidden;
		transform-style: preserve-3d;
	}
	.flip-back {
		transform: rotateY(180deg);
	}
	/* When flipped: front rotates away, back rotates in */
	.flipped .flip-front {
		transform: rotateY(-180deg);
	}
	.flipped .flip-back {
		transform: rotateY(0deg);
	}
</style>
