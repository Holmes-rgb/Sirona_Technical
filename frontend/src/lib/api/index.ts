/**
 * API package.
 *
 * `client.ts` holds the HTTP core; one module per resource sits on top of it and
 * exposes named, typed functions. Components import from '$lib/api' and never build a
 * URL or call fetch themselves.
 *
 * To add a resource, create the module and re-export it below:
 *
 *     // src/lib/api/todos.ts
 *     import { api, type RequestOptions } from './client';
 *
 *     export interface Todo {
 *         id: number;
 *         title: string;
 *         completed: boolean;
 *         parentId: number | null;
 *     }
 *
 *     export function listTodos(options?: RequestOptions) {
 *         return api.get<Todo[]>('/todos/', options);
 *     }
 */

export { api, ApiError } from './client';
export type { Paginated, RequestOptions } from './client';
