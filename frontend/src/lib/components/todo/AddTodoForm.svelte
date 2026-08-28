<!--
	A single-field form for creating a todo.

	Used for both the top-level form and the inline sub-todo form -- the only
	differences are the placeholder and whether a cancel affordance is offered, so one
	component covers both rather than two near-identical ones.
-->
<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';

	interface Props {
		placeholder: string;
		/** Called with the trimmed title. Never called with an empty string. */
		onSubmit: (title: string) => void;
		/** Shown as a Cancel button when provided; also fired on Escape. */
		onCancel?: () => void;
		submitLabel?: string;
		autofocus?: boolean;
	}

	let { placeholder, onSubmit, onCancel, submitLabel = 'Add', autofocus = false }: Props = $props();

	let title = $state('');

	// Disable submission for an empty or whitespace-only title, so the button's state
	// tells the user why nothing will happen instead of failing silently on click.
	const canSubmit = $derived(title.trim().length > 0);

	function submit(event: SubmitEvent) {
		event.preventDefault();
		if (!canSubmit) return;

		onSubmit(title.trim());
		title = '';
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && onCancel) {
			event.preventDefault();
			onCancel();
		}
	}
</script>

<form class="flex gap-2" onsubmit={submit}>
	<Input
		bind:value={title}
		{placeholder}
		{autofocus}
		onkeydown={onKeydown}
		aria-label={placeholder}
	/>
	<Button type="submit" disabled={!canSubmit}>{submitLabel}</Button>
	{#if onCancel}
		<Button type="button" variant="ghost" onclick={onCancel}>Cancel</Button>
	{/if}
</form>
