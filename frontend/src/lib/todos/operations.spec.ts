/**
 * Tests for the todo list operations.
 *
 * These are the functions that keep the UI in step with the server, so they are the
 * part of the frontend most worth pinning down. Being pure, they need no browser and
 * no rendering -- the whole file runs in Node in milliseconds.
 */

import { describe, expect, it } from 'vitest';
import type { Todo } from '$lib/api/todos';
import {
	applyCreateResponse,
	applyDeleteResponse,
	applyToggleResponse,
	buildTree,
	removeTodoAndChildren,
	replaceMany,
	replaceTodo
} from './operations';

/** Terse todo builder, so each test shows only the fields it cares about. */
function todo(id: number, overrides: Partial<Todo> = {}): Todo {
	return { id, title: `Todo ${id}`, completed: false, parentId: null, ...overrides };
}

const parent = todo(1, { title: 'Groceries' });
const milk = todo(2, { title: 'Milk', parentId: 1 });
const eggs = todo(3, { title: 'Eggs', parentId: 1 });
const unrelated = todo(4, { title: 'Laundry' });

const list = [parent, milk, eggs, unrelated];

describe('buildTree', () => {
	it('nests sub-todos under their parent and leaves other todos top-level', () => {
		const tree = buildTree(list);

		expect(tree.map((node) => node.id)).toEqual([1, 4]);
		expect(tree[0].children.map((child) => child.id)).toEqual([2, 3]);
		expect(tree[1].children).toEqual([]);
	});

	it('preserves the order the server sent', () => {
		// The API orders by creation time; the UI must not reshuffle it.
		const tree = buildTree([eggs, parent, milk]);

		expect(tree[0].children.map((child) => child.title)).toEqual(['Eggs', 'Milk']);
	});

	it('returns an empty array for an empty list', () => {
		expect(buildTree([])).toEqual([]);
	});

	it('drops a sub-todo whose parent is not in the list', () => {
		// There is nowhere sensible to render it, and promoting it to top-level would
		// misrepresent it as an independent todo.
		const tree = buildTree([todo(9, { parentId: 99 })]);

		expect(tree).toEqual([]);
	});

	it('does not mutate the input list', () => {
		const input = [parent, milk];

		buildTree(input);

		expect(input).toEqual([parent, milk]);
	});
});

describe('replaceTodo', () => {
	it('swaps the matching todo and leaves the rest alone', () => {
		const renamed = { ...milk, title: 'Oat milk' };

		const next = replaceTodo(list, renamed);

		expect(next[1]).toEqual(renamed);
		expect(next[0]).toBe(parent);
		expect(next[3]).toBe(unrelated);
	});

	it('returns an equivalent list when the id is absent', () => {
		expect(replaceTodo(list, todo(999))).toEqual(list);
	});
});

describe('applyToggleResponse', () => {
	it('updates the toggled sub-todo', () => {
		const next = applyToggleResponse(list, {
			todo: { ...milk, completed: true },
			parent: { ...parent, completed: false },
			children: []
		});

		expect(next.find((t) => t.id === 2)?.completed).toBe(true);
	});

	it('applies the parent the server returned, so no refetch is needed', () => {
		// The heart of the requirement: completing the last sub-todo completes the
		// parent, and one response carries both changes.
		const next = applyToggleResponse(list, {
			todo: { ...eggs, completed: true },
			parent: { ...parent, completed: true },
			children: []
		});

		expect(next.find((t) => t.id === 3)?.completed).toBe(true);
		expect(next.find((t) => t.id === 1)?.completed).toBe(true);
	});

	it('re-opens the parent when a sub-todo is unchecked', () => {
		const completed = [
			{ ...parent, completed: true },
			{ ...milk, completed: true },
			{ ...eggs, completed: true }
		];

		const next = applyToggleResponse(completed, {
			todo: { ...milk, completed: false },
			parent: { ...parent, completed: false },
			children: []
		});

		expect(next.find((t) => t.id === 1)?.completed).toBe(false);
	});

	it('handles a null parent when a top-level todo is toggled', () => {
		const next = applyToggleResponse(list, {
			todo: { ...unrelated, completed: true },
			parent: null,
			children: []
		});

		expect(next.find((t) => t.id === 4)?.completed).toBe(true);
	});

	it('applies every child when toggling a parent cascades down', () => {
		// The direction that was previously broken: the server cascaded and persisted
		// the children, but the response omitted them, so the UI showed a ticked parent
		// above unticked sub-todos until the page was reloaded.
		const next = applyToggleResponse(list, {
			todo: { ...parent, completed: true },
			parent: null,
			children: [
				{ ...milk, completed: true },
				{ ...eggs, completed: true }
			]
		});

		expect(next.find((t) => t.id === 1)?.completed).toBe(true);
		expect(next.find((t) => t.id === 2)?.completed).toBe(true);
		expect(next.find((t) => t.id === 3)?.completed).toBe(true);
		expect(next.find((t) => t.id === 4)).toBe(unrelated);
	});

	it('applies the cascade in reverse when a parent is unticked', () => {
		const allDone = [
			{ ...parent, completed: true },
			{ ...milk, completed: true },
			{ ...eggs, completed: true }
		];

		const next = applyToggleResponse(allDone, {
			todo: { ...parent, completed: false },
			parent: null,
			children: [milk, eggs]
		});

		expect(next.every((t) => t.completed === false)).toBe(true);
	});

	it('leaves unrelated todos untouched', () => {
		const next = applyToggleResponse(list, {
			todo: { ...milk, completed: true },
			parent: { ...parent, completed: false },
			children: []
		});

		expect(next.find((t) => t.id === 4)).toBe(unrelated);
	});
});

describe('replaceMany', () => {
	it('applies several updates in a single pass', () => {
		const next = replaceMany(list, [
			{ ...milk, completed: true },
			{ ...eggs, completed: true }
		]);

		expect(next.find((t) => t.id === 2)?.completed).toBe(true);
		expect(next.find((t) => t.id === 3)?.completed).toBe(true);
		expect(next.find((t) => t.id === 4)).toBe(unrelated);
	});

	it('ignores updates for ids not in the list', () => {
		// The list is the authority on what is currently rendered.
		expect(replaceMany(list, [todo(999)])).toEqual(list);
	});

	it('returns the same list when there is nothing to apply', () => {
		expect(replaceMany(list, [])).toBe(list);
	});
});

describe('applyCreateResponse', () => {
	it('appends the created todo', () => {
		const created = todo(5, { title: 'Bread', parentId: 1 });

		const next = applyCreateResponse(list, { todo: created, parent: parent });

		expect(next.at(-1)).toEqual(created);
	});

	it('applies the re-opened parent the server returned', () => {
		// A new sub-todo is always incomplete, so it re-opens a completed parent --
		// and the client applies that rather than working it out.
		const completedParent = { ...parent, completed: true };
		const before = [completedParent, { ...milk, completed: true }];

		const next = applyCreateResponse(before, {
			todo: todo(5, { title: 'Bread', parentId: 1 }),
			parent: { ...parent, completed: false }
		});

		expect(next.find((t) => t.id === 1)?.completed).toBe(false);
	});

	it('leaves the list alone when no parent comes back', () => {
		const next = applyCreateResponse(list, { todo: todo(5), parent: null });

		expect(next).toHaveLength(list.length + 1);
		expect(next.find((t) => t.id === 1)).toBe(parent);
	});
});

describe('removeTodoAndChildren', () => {
	it('removes a parent along with its sub-todos', () => {
		const next = removeTodoAndChildren(list, 1);

		expect(next.map((t) => t.id)).toEqual([4]);
	});

	it('removes only the sub-todo when given one', () => {
		const next = removeTodoAndChildren(list, 2);

		expect(next.map((t) => t.id)).toEqual([1, 3, 4]);
	});
});

describe('applyDeleteResponse', () => {
	it('completes the parent when the last incomplete sub-todo is deleted', () => {
		const almostDone = [parent, { ...milk, completed: true }, eggs];

		const next = applyDeleteResponse(almostDone, 3, { parent: { ...parent, completed: true } });

		expect(next.map((t) => t.id)).toEqual([1, 2]);
		expect(next.find((t) => t.id === 1)?.completed).toBe(true);
	});

	it('removes a parent and its children when no parent comes back', () => {
		const next = applyDeleteResponse(list, 1, { parent: null });

		expect(next.map((t) => t.id)).toEqual([4]);
	});
});
