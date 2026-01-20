<script lang="ts">
	import type { CardItem } from "../types/card-item";
	import Modal from "./Modal.svelte";
	import Portal from "./Portal.svelte";

	export let item: CardItem;
	export let bannerRatio: number = 33.33;
	export let modalWidth: number = 95;
	export let modalHeight: number = 95;

	$: linkLabel = new URL(item.link).hostname;

	let isOpen = false;

	function openModal() {
		isOpen = true;
	}
	function closeModal() {
		isOpen = false;
	}
	function handleLinkClick(event: MouseEvent) {
		event.stopPropagation();
	}
</script>

<div
	class="card"
	style="--banner-ratio: {bannerRatio}%"
	on:click={openModal}
	role="button"
	tabindex="0"
	on:keydown={(e) => e.key === "Enter" && openModal()}
>
	{#if item.bannerImage}
		<div class="card__banner">
			<img src={item.bannerImage} alt={item.title} />
		</div>
	{/if}
	<div class="card__content">
		<h2 class="card__title">{item.title}</h2>
		<a
			href={item.link}
			target="_blank"
			rel="noopener noreferrer"
			class="card__link"
			on:click={handleLinkClick}
		>
			{linkLabel} →
		</a>
	</div>
</div>

{#if isOpen}
	<Portal>
		<Modal {item} {modalWidth} {modalHeight} onClose={closeModal} />
	</Portal>
{/if}
