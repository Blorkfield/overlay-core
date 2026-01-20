<script lang="ts">
	import type { CardItem } from "../types/card-item";

	export let item: CardItem;
	export let modalWidth: number = 95;
	export let modalHeight: number = 95;
	export let onClose: () => void;

	$: linkLabel = new URL(item.link).hostname;

	function handleBackdropClick(event: MouseEvent) {
		if (event.target === event.currentTarget) {
			onClose();
		}
	}
	function handleKeydown(event: KeyboardEvent) {
		if (event.key === "Escape") {
			onClose();
		}
	}
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="modal__backdrop" on:click={handleBackdropClick} role="dialog" aria-modal="true">
	<div class="modal__dialog" style="--modal-width: {modalWidth}vw; --modal-height: {modalHeight}vh">
		<button class="modal__close" on:click={onClose} aria-label="Close modal">×</button>
		{#if item.bannerImage}
			<div class="modal__banner">
				<img src={item.bannerImage} alt={item.title} />
			</div>
		{/if}
		<div class="modal__content">
			<h1 class="modal__title">{item.title}</h1>
			<p class="modal__description">{item.description}</p>
			<a href={item.link} target="_blank" rel="noopener noreferrer" class="modal__link">
				{linkLabel}
			</a>
		</div>
	</div>
</div>
