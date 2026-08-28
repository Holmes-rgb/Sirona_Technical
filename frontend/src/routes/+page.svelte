<!--
	Scaffold verification page.

	Proves the whole stack is wired: Tailwind and the shadcn theme render, a
	server-side load function reached Django before this page was sent, and a
	browser-side call reaches it too. Replace the body once the challenge starts, but
	keep a health check around until the API is definitely reachable.
-->
<script lang="ts">
	import { api, ApiError } from '$lib/api';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';

	// Data returned by +page.server.ts, already resolved when this renders.
	let { data } = $props();

	interface Health {
		status: string;
	}

	// $state holds the result so the template re-renders when the request settles.
	// Runes mode is enforced project-wide (see vite.config.ts).
	let result = $state<string | null>(null);
	let error = $state<string | null>(null);
	let loading = $state(false);

	async function checkApi() {
		loading = true;
		error = null;
		result = null;

		try {
			const health = await api.get<Health>('/health/');
			result = health.status;
		} catch (e) {
			// ApiError means Django answered with an error status. Anything else means
			// the request never arrived — usually the backend isn't running, which is
			// a completely different thing to debug.
			error =
				e instanceof ApiError
					? `API responded ${e.status}`
					: 'Could not reach the API — is the Django server running?';
		} finally {
			loading = false;
		}
	}
</script>

<main class="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 p-8">
	<Card.Root>
		<Card.Header>
			<Card.Title>Scaffold check</Card.Title>
			<Card.Description>
				SvelteKit + Tailwind + shadcn-svelte on the front, Django REST Framework behind the
				<code>/api</code> proxy.
			</Card.Description>
		</Card.Header>

		<Card.Content class="flex flex-col gap-4">
			<!-- Server-side: resolved during SSR, before this HTML was sent. -->
			<div class="flex items-center gap-3">
				<span class="text-sm text-muted-foreground">Server-side load:</span>
				{#if data.apiReachable}
					<Badge variant="secondary">
						reached API — {data.session.authenticated ? 'signed in' : 'signed out'}
					</Badge>
				{:else}
					<Badge variant="destructive">{data.apiError}</Badge>
				{/if}
			</div>

			<!-- Browser-side: fetched on click, through the same proxy. -->
			<div class="flex items-center gap-3">
				<Button onclick={checkApi} disabled={loading}>
					{loading ? 'Checking…' : 'Call /api/health/'}
				</Button>

				{#if result}
					<Badge>API says: {result}</Badge>
				{:else if error}
					<Badge variant="destructive">{error}</Badge>
				{/if}
			</div>
		</Card.Content>
	</Card.Root>
</main>
