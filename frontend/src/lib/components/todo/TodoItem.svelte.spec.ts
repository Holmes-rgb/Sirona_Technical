/**
 * Component tests for TodoItem.
 *
 * Runs in real Chromium (the `client` Vitest project), so the checkbox is a real
 * element receiving real clicks rather than a jsdom approximation.
 *
 * TodoItem is purely presentational: it renders a todo and reports what the user did
 * through callbacks. So that is exactly what these pin down -- what appears, and what
 * gets called. Anything about *completion rules* is the server's, and is tested in
 * backend/api/tests/test_todos.py.
 */

import { describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';

import TodoItem from './TodoItem.svelte';
import type { Todo } from '$lib/api/todos';

function todo(overrides: Partial<Todo> = {}): Todo {
	return { id: 1, title: 'Milk', completed: false, parentId: 2, ...overrides };
}

/** Renders with no-op callbacks unless a test overrides one. */
function renderItem(props: Partial<Parameters<typeof TodoItem>[1]> = {}) {
	return render(TodoItem, {
		todo: todo(),
		onToggle: () => {},
		onDelete: () => {},
		onRename: () => {},
		...props
	});
}

describe('TodoItem', () => {
	it('renders the title with an unchecked box for an incomplete todo', async () => {
		renderItem();

		await expect.element(page.getByText('Milk')).toBeInTheDocument();
		await expect.element(page.getByRole('checkbox', { name: 'Milk' })).not.toBeChecked();
	});

	it('reflects a completed todo as checked and struck through', async () => {
		// The strike-through is the at-a-glance signal that something is done, so it is
		// worth asserting rather than trusting the class list.
		renderItem({ todo: todo({ completed: true }) });

		await expect.element(page.getByRole('checkbox', { name: 'Milk' })).toBeChecked();
		await expect.element(page.getByText('Milk')).toHaveClass(/line-through/);
	});

	it('calls onToggle when the checkbox is clicked', async () => {
		const onToggle = vi.fn();
		renderItem({ onToggle });

		await page.getByRole('checkbox', { name: 'Milk' }).click();

		expect(onToggle).toHaveBeenCalledOnce();
	});

	it('calls onDelete when the delete button is clicked', async () => {
		const onDelete = vi.fn();
		renderItem({ onDelete });

		await page.getByRole('button', { name: 'Delete Milk' }).click();

		expect(onDelete).toHaveBeenCalledOnce();
	});

	it('disables the checkbox while a request is in flight', async () => {
		// This is the guard against double-toggling: a second click before the first
		// response lands would send a second request and flip the todo back.
		renderItem({ pending: true });

		await expect.element(page.getByRole('checkbox', { name: 'Milk' })).toBeDisabled();
	});
});
