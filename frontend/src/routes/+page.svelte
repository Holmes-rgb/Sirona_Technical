<!--
	The todo page.

	A shell: it owns the store and lays out the pieces. All list behaviour lives in the
	store, and all rendering in the todo components.
-->
<script lang="ts">
	import { untrack } from 'svelte';

	import * as Card from '$lib/components/ui/card';
	import AddTodoForm from '$lib/components/todo/AddTodoForm.svelte';
	import TodoList from '$lib/components/todo/TodoList.svelte';
	import { createTodoStore } from '$lib/todos/store.svelte';

	let { data } = $props();

	// Seeded with the todos the server load already fetched, so the first render is
	// the real list rather than an empty one that fills in a moment later.
	//
	// untrack because this is a one-time handover: from here the store owns the list,
	// and re-seeding it if `data` changed would throw away every local update.
	const store = createTodoStore(untrack(() => data.todos));
</script>

<svelte:head><title>Todos</title></svelte:head>

<main class="mx-auto w-full max-w-2xl p-6 sm:p-10">
	<Card.Root>
		<Card.Header>
			<Card.Title>Todos</Card.Title>
			<Card.Description>Tick every sub-todo and its parent completes itself.</Card.Description>
		</Card.Header>

		<Card.Content class="flex flex-col gap-4">
			{#if data.loadError}
				<p
					class="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
					role="alert"
				>
					{data.loadError}
				</p>
			{/if}

			<AddTodoForm placeholder="What needs doing?" onSubmit={(title) => store.add(title)} />

			<TodoList {store} />
		</Card.Content>
	</Card.Root>
</main>
