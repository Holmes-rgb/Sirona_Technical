<!--
	One todo row: checkbox, title, and its actions.

	Used unchanged for both top-level todos and sub-todos -- a sub-todo differs only in
	indentation and text size, which the parent list applies. Keeping one row component
	means the checkbox, editing and delete behaviour cannot drift between the two
	levels.

	Purely presentational: it fetches nothing and knows nothing about completion rules.
	It reports what the user did through callbacks and renders whatever it is given.
-->
<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import type { Todo } from '$lib/api/todos';

	interface Props {
		todo: Todo;
		/** True while a request for this todo is in flight; disables its controls. */
		pending?: boolean;
		onToggle: () => void;
		onDelete: () => void;
		onRename: (title: string) => void;
	}

	let { todo, pending = false, onToggle, onDelete, onRename }: Props = $props();

	let editing = $state(false);
	let draft = $state('');

	function startEditing() {
		draft = todo.title;
		editing = true;
	}

	function commit() {
		const title = draft.trim();
		editing = false;

		// Skip the request when nothing actually changed, or when the user cleared the
		// field -- an empty title would be rejected by the server anyway.
		if (title && title !== todo.title) onRename(title);
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			commit();
		} else if (event.key === 'Escape') {
			event.preventDefault();
			editing = false;
		}
	}
</script>

<div class="group flex items-center gap-3 py-1.5">
	<Checkbox
		id="todo-{todo.id}"
		checked={todo.completed}
		disabled={pending}
		onCheckedChange={onToggle}
		aria-label={todo.title}
	/>

	{#if editing}
		<Input
			bind:value={draft}
			autofocus
			onblur={commit}
			onkeydown={onKeydown}
			class="h-7 flex-1"
			aria-label="Edit title"
		/>
	{:else}
		<Label
			for="todo-{todo.id}"
			class="flex-1 cursor-pointer font-normal
				{todo.completed ? 'text-muted-foreground line-through' : ''}"
		>
			{todo.title}
		</Label>

		<!--
			Actions stay hidden until the row is hovered or focused, so a long list reads
			as titles rather than rows of buttons. focus-within keeps them reachable by
			keyboard, which hover alone would not.
		-->
		<div
			class="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100"
		>
			<Button variant="ghost" size="sm" onclick={startEditing} aria-label="Rename {todo.title}">
				Edit
			</Button>
			<Button
				variant="ghost"
				size="sm"
				disabled={pending}
				onclick={onDelete}
				aria-label="Delete {todo.title}"
			>
				Delete
			</Button>
		</div>
	{/if}
</div>
