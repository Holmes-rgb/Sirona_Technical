<!--
	The todo list: each top-level todo, its sub-todos indented beneath, and a
	contextual control for adding another sub-todo.

	Deliberately not a recursive component. The domain is exactly one level deep and
	the API rejects anything deeper, so a component that rendered itself would advertise
	a capability the system does not have. Two explicit levels match the constraint and
	are easier to follow.

	The nesting rendered here is `store.tree`, a derived projection of the flat list the
	API returns. Nothing nested is ever stored, so there is no second copy of the data
	to keep in step.
-->
<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Separator } from '$lib/components/ui/separator';
	import AddTodoForm from './AddTodoForm.svelte';
	import TodoItem from './TodoItem.svelte';
	import type { TodoStore } from '$lib/todos/store.svelte';

	interface Props {
		store: TodoStore;
	}

	let { store }: Props = $props();

	// Which parent currently has its "add sub-todo" input open. Only one at a time --
	// the input is a transient affordance, not part of the list's content.
	let addingUnder = $state<number | null>(null);

	async function addSubTodo(parentId: number, title: string) {
		await store.add(title, parentId);
		addingUnder = null;
	}
</script>

{#if store.tree.length === 0}
	<p class="py-8 text-center text-sm text-muted-foreground">
		No todos yet. Add one above to get started.
	</p>
{:else}
	<ul class="flex flex-col">
		{#each store.tree as parent, index (parent.id)}
			<li>
				{#if index > 0}
					<Separator class="my-1" />
				{/if}

				<TodoItem
					todo={parent}
					pending={store.isPending(parent.id)}
					onToggle={() => store.toggle(parent.id)}
					onDelete={() => store.remove(parent.id)}
					onRename={(title) => store.rename(parent.id, title)}
				/>

				<!-- Sub-todos: indented, and visually subordinate via the border. -->
				{#if parent.children.length > 0}
					<ul class="ml-3 border-l border-border pl-4">
						{#each parent.children as child (child.id)}
							<li>
								<TodoItem
									todo={child}
									pending={store.isPending(child.id)}
									onToggle={() => store.toggle(child.id)}
									onDelete={() => store.remove(child.id)}
									onRename={(title) => store.rename(child.id, title)}
								/>
							</li>
						{/each}
					</ul>
				{/if}

				<div class="ml-3 pl-4">
					{#if addingUnder === parent.id}
						<AddTodoForm
							placeholder="Sub-todo title"
							submitLabel="Add"
							autofocus
							onSubmit={(title) => addSubTodo(parent.id, title)}
							onCancel={() => (addingUnder = null)}
						/>
					{:else}
						<Button
							variant="ghost"
							size="sm"
							class="h-7 px-2 text-muted-foreground"
							onclick={() => (addingUnder = parent.id)}
						>
							+ Add sub-todo
						</Button>
					{/if}
				</div>
			</li>
		{/each}
	</ul>
{/if}
