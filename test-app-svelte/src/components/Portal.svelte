<script lang="ts">
	import { onMount, onDestroy } from "svelte";

	let target: HTMLElement;
	let container: HTMLDivElement;

	onMount(() => {
		target = document.body;
		target.appendChild(container);
	});

	onDestroy(() => {
		if (container && container.parentNode) {
			container.parentNode.removeChild(container);
		}
	});
</script>

<div bind:this={container} class="portal">
	<slot />
</div>

<style>
	.portal {
		display: contents;
	}
</style>
