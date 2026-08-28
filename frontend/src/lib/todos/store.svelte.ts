/**
 * Reactive todo state.
 *
 * A thin layer: it holds the list, calls the API, and hands each response to a pure
 * function in operations.ts. No completion rules live here -- those are the server's,
 * and duplicating them in the client would create a second implementation free to
 * disagree with the first.
 *
 * A `.svelte.ts` file so it can use runes outside a component, and a factory rather
 * than a module-level singleton so every page instance (and every test) gets its own
 * state instead of sharing one across server renders.
 */

import { SvelteSet } from 'svelte/reactivity';
import { toast } from 'svelte-sonner';

import { ApiError } from '$lib/api';
import {
	createTodo,
	deleteTodo,
	listTodos,
	renameTodo,
	toggleTodo,
	type Todo
} from '$lib/api/todos';
import {
	applyDeleteResponse,
	applyToggleResponse,
	buildTree,
	replaceTodo
} from '$lib/todos/operations';

/** Turn a thrown error into something worth showing a user. */
function describe(error: unknown, fallback: string): string {
	if (error instanceof ApiError) {
		// DRF validation errors arrive as { field: [messages] }; surface the first.
		const fieldErrors = error.fieldErrors;
		if (fieldErrors) {
			const first = Object.values(fieldErrors)[0];
			if (Array.isArray(first) && first.length > 0) return first[0];
		}
		return `${fallback} (${error.status})`;
	}
	return 'Could not reach the API — is the Django server running?';
}

export function createTodoStore(initial: Todo[] = []) {
	// State mirrors the API exactly: one flat array, parents and sub-todos together.
	let todos = $state<Todo[]>(initial);

	// Ids with a request in flight, used to disable that row's checkbox so it cannot
	// be toggled twice before the first answer arrives.
	//
	// SvelteSet rather than a plain Set: mutating a normal Set does not notify Svelte,
	// so the UI would never see the change.
	const pending = new SvelteSet<number>();

	// Nesting is derived, never stored. There is only ever one source of truth for the
	// list, so the flat array and the rendered tree cannot fall out of step.
	const tree = $derived(buildTree(todos));

	/** Run an action with `id` marked pending, clearing it however the call ends. */
	async function withPending(id: number, action: () => Promise<void>) {
		pending.add(id);
		try {
			await action();
		} finally {
			pending.delete(id);
		}
	}

	return {
		get tree() {
			return tree;
		},

		/** The flat list, exposed mainly for tests and debugging. */
		get todos() {
			return todos;
		},

		isPending(id: number) {
			return pending.has(id);
		},

		/** Re-read the whole list. Not used in normal operation -- see `toggle`. */
		async reload() {
			try {
				todos = await listTodos();
			} catch (error) {
				toast.error(describe(error, 'Could not load todos'));
			}
		},

		/** Create a todo, or a sub-todo when `parentId` is given. */
		async add(title: string, parentId: number | null = null) {
			try {
				const created = await createTodo(title, parentId);
				todos = [...todos, created];

				// Adding an incomplete sub-todo re-opens a completed parent. The server
				// has already done that; the create response only carries the new todo,
				// so reflect it locally. It is deterministic -- a new sub-todo is always
				// incomplete, so its parent can only become incomplete.
				if (created.parentId !== null) {
					const parent = todos.find((todo) => todo.id === created.parentId);
					if (parent?.completed) {
						todos = replaceTodo(todos, { ...parent, completed: false });
					}
				}
			} catch (error) {
				toast.error(describe(error, 'Could not add todo'));
			}
		},

		/**
		 * Flip a todo's completed state.
		 *
		 * The response carries both the toggled todo and its recalculated parent, so
		 * one request updates every row that changed -- no follow-up fetch, and no
		 * reimplementation of the completion rule on the client.
		 */
		async toggle(id: number) {
			await withPending(id, async () => {
				try {
					todos = applyToggleResponse(todos, await toggleTodo(id));
				} catch (error) {
					// State is left untouched, so the checkbox stays where the server
					// last said it was rather than drifting.
					toast.error(describe(error, 'Could not update todo'));
				}
			});
		},

		/** Delete a todo, and its sub-todos if it has any. */
		async remove(id: number) {
			await withPending(id, async () => {
				try {
					todos = applyDeleteResponse(todos, id, await deleteTodo(id));
				} catch (error) {
					toast.error(describe(error, 'Could not delete todo'));
				}
			});
		},

		/** Rename a todo. Only the title is editable; completion is toggle-only. */
		async rename(id: number, title: string) {
			try {
				todos = replaceTodo(todos, await renameTodo(id, title));
			} catch (error) {
				toast.error(describe(error, 'Could not rename todo'));
			}
		}
	};
}

/** The store's public shape, for typing component props. */
export type TodoStore = ReturnType<typeof createTodoStore>;
