/**
 * Todo endpoints.
 *
 * A resource module: named, typed functions over the HTTP core in client.ts. Nothing
 * outside this file builds a todo URL.
 *
 * Note the trailing slash on every path. Django's APPEND_SLASH redirects a GET that
 * is missing one, but *not* a POST or PATCH carrying a body -- those would silently
 * lose their payload to the redirect.
 */

import { api, type RequestOptions } from './client';

/** A todo, exactly as the API represents it. Sub-todos are one level deep only. */
export interface Todo {
	id: number;
	title: string;
	completed: boolean;
	/** null for a top-level todo, otherwise the id of its parent. */
	parentId: number | null;
}

/**
 * Completion propagates in both directions, so a toggle can change more than the todo
 * that was clicked. The server reports whichever happened:
 *
 *   - toggling a sub-todo may complete or re-open its `parent`
 *   - toggling a top-level todo cascades down to its `children`
 *
 * The unused side comes back null or empty rather than missing, so there is one shape
 * to handle. Between them these cover every row the request changed, which is what
 * makes updating the UI possible without refetching the list.
 */
export interface ToggleResponse {
	todo: Todo;
	parent: Todo | null;
	children: Todo[];
}

/**
 * Creating a sub-todo can change a second row: a new child is always incomplete, so it
 * re-opens a parent that was complete. The server returns that parent for the same
 * reason toggle returns what it changed.
 *
 * `parent` is null when the created todo is top-level.
 */
export interface CreateResponse {
	todo: Todo;
	parent: Todo | null;
}

/**
 * Deleting a sub-todo can complete its parent -- remove the last outstanding item and
 * everything remaining is done. The server returns the recalculated parent for the
 * same reason toggle does.
 */
export interface DeleteResponse {
	parent: Todo | null;
}

/** Every todo, flat: parents and sub-todos in one array, ordered by creation. */
export function listTodos(options?: RequestOptions) {
	return api.get<Todo[]>('/todos/', options);
}

/** Create a todo. Pass a parentId to make it a sub-todo of that todo. */
export function createTodo(
	title: string,
	parentId: number | null = null,
	options?: RequestOptions
) {
	return api.post<CreateResponse>('/todos/', { title, parentId }, options);
}

/**
 * Flip a todo's completed state.
 *
 * Sends no body -- the endpoint acts on the todo identified in the URL, and what the
 * new state should be is the server's decision, not the client's.
 */
export function toggleTodo(id: number, options?: RequestOptions) {
	return api.patch<ToggleResponse>(`/todos/${id}/toggle/`, undefined, options);
}

/** Delete a todo. Sub-todos of a deleted parent are removed by the database cascade. */
export function deleteTodo(id: number, options?: RequestOptions) {
	return api.del<DeleteResponse>(`/todos/${id}/`, options);
}

/**
 * Rename a todo.
 *
 * Only the title can be changed this way: `completed` is read-only on the server, so
 * toggle is the sole path to completion state and the parent invariant cannot be
 * bypassed by a plain update.
 */
export function renameTodo(id: number, title: string, options?: RequestOptions) {
	return api.patch<Todo>(`/todos/${id}/`, { title }, options);
}
