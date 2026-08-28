/**
 * API package.
 *
 * `client.ts` holds the HTTP core; one module per resource sits on top of it and
 * exposes named, typed functions. Components import from '$lib/api' and never build a
 * URL or call fetch themselves.
 *
 * To add a resource, create the module and re-export it below:
 *
 *     // src/lib/api/tasks.ts
 *     import { api, type Paginated, type RequestOptions } from './client';
 *
 *     export interface Task {
 *         id: number;
 *         name: string;
 *         status: 'ACTIVE' | 'COMPLETE';
 *     }
 *
 *     export function listTasks(options?: RequestOptions) {
 *         return api.get<Paginated<Task>>('/tasks/', options);
 *     }
 *
 *     export function createTask(payload: Partial<Task>, options?: RequestOptions) {
 *         return api.post<Task>('/tasks/', payload, options);
 *     }
 *
 *     export function deleteTask(id: number, options?: RequestOptions) {
 *         return api.del(`/tasks/${id}/`, options);
 *     }
 */

export { api, ApiError, clearCsrfToken, ensureCsrfToken } from './client';
export type { Paginated, RequestOptions } from './client';

export * from './auth';
