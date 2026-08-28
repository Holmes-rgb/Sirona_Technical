<!--
	Scaffold verification page.

	Its only job is to prove the whole stack is wired: Tailwind and the shadcn theme
	are rendering, and a real request reaches Django through the Vite proxy. Replace
	the body with the actual application once the challenge starts, but keep the
	health fetch somewhere until the API is definitely reachable.
-->
<script lang="ts">
	import { api, ApiError } from '$lib/api';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';

	interface Health {
		status: string;
	}

	// $state holds the result so the template re-renders when the request settles.
	// Svelte 5 runes mode is enforced project-wide (see vite.config.ts).
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
			// ApiError means we reached Django and it answered with an error status.
			// Anything else means the request never got there -- usually the backend
			// is not running, which is a completely different thing to debug.
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
				SvelteKit + Tailwind + shadcn-svelte on the front, Django REST Framework behind the <code
					>/api</code
				> proxy.
			</Card.Description>
		</Card.Header>

		<Card.Content class="flex items-center gap-3">
			<Button onclick={checkApi} disabled={loading}>
				{loading ? 'Checking…' : 'Call /api/health/'}
			</Button>

			{#if result}
				<Badge>API says: {result}</Badge>
			{:else if error}
				<Badge variant="destructive">{error}</Badge>
			{/if}
		</Card.Content>
	</Card.Root>
</main>
