/**
 * Pure list operations for todos.
 *
 * The application holds todos in exactly the shape the API returns them: one flat
 * array. Nesting is produced on demand by `buildTree` for rendering, and never stored.
 *
 * That choice is what keeps updates simple. When the server reports a change it names
 * the affected rows by id, so applying it is a swap in a flat array -- no tree to walk,
 * no parallel representation that can drift out of step with the first.
 *
 * Everything here is a plain function over plain arrays: no runes, no components, no
 * network. That is deliberate, because this is the logic worth testing, and it should
 * be testable without rendering anything.
 *
 * Every function returns a new array rather than mutating its input, so assigning the
 * result back into `$state` reliably triggers an update.
 */

import type { DeleteResponse, Todo, ToggleResponse } from '$lib/api/todos';

/** A top-level todo with its sub-todos attached, ready to render. */
export interface TodoNode extends Todo {
	children: Todo[];
}

/**
 * Group a flat todo list into top-level todos each carrying their sub-todos.
 *
 * Buckets the sub-todos in a single pass and then attaches them, so this stays O(n).
 * Filtering the whole list once per parent would be O(n * parents), which is fine for
 * a demo list and needlessly quadratic for a real one.
 *
 * Relative order is preserved from the input, and the server already sorts by
 * creation time, so the list never reshuffles between renders.
 *
 * A sub-todo whose parent is missing from the list is dropped: it cannot be rendered
 * anywhere sensible, and showing it as a top-level todo would misrepresent it.
 */
export function buildTree(todos: Todo[]): TodoNode[] {
	const childrenByParent = new Map<number, Todo[]>();

	for (const todo of todos) {
		if (todo.parentId === null) continue;

		const siblings = childrenByParent.get(todo.parentId);
		if (siblings) {
			siblings.push(todo);
		} else {
			childrenByParent.set(todo.parentId, [todo]);
		}
	}

	return todos
		.filter((todo) => todo.parentId === null)
		.map((parent) => ({ ...parent, children: childrenByParent.get(parent.id) ?? [] }));
}

/** Replace one todo by id. Returns the list unchanged if the id isn't present. */
export function replaceTodo(todos: Todo[], updated: Todo): Todo[] {
	return todos.map((todo) => (todo.id === updated.id ? updated : todo));
}

/**
 * Apply a toggle response to the list.
 *
 * This is the whole "stay in sync without re-fetching" requirement in three lines.
 * Toggling a sub-todo can change two rows -- itself, and its parent if that crossed
 * the all-children-complete threshold -- and the server sends both back in one
 * response. Applying them by id means one request, no follow-up GET, and no need for
 * the client to work out the parent's new state for itself.
 *
 * That last point matters: the completion rule lives on the server precisely so there
 * is one implementation of it. Recomputing the parent here would be a second one, free
 * to disagree.
 */
export function applyToggleResponse(todos: Todo[], response: ToggleResponse): Todo[] {
	const next = replaceTodo(todos, response.todo);
	return response.parent ? replaceTodo(next, response.parent) : next;
}

/**
 * Remove a todo and any sub-todos belonging to it.
 *
 * Mirrors the database's ON DELETE CASCADE, so deleting a parent clears its children
 * from the UI in the same pass the server clears them from the table.
 */
export function removeTodoAndChildren(todos: Todo[], id: number): Todo[] {
	return todos.filter((todo) => todo.id !== id && todo.parentId !== id);
}

/**
 * Apply a delete response: drop the deleted todo (and its children), then apply the
 * parent the server recalculated.
 *
 * The parent matters because removing a sub-todo can complete it -- delete the last
 * outstanding item and everything left is done.
 */
export function applyDeleteResponse(
	todos: Todo[],
	deletedId: number,
	response: DeleteResponse
): Todo[] {
	const next = removeTodoAndChildren(todos, deletedId);
	return response.parent ? replaceTodo(next, response.parent) : next;
}
