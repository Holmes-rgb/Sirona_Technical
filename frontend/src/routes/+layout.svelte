<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { Toaster } from '$lib/components/ui/sonner';

	let { children } = $props();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

{@render children()}

<!-- Renders the toasts raised by the store when an API call fails. Without this
     mounted somewhere in the layout, toast.error() would do nothing visible. -->
<Toaster />
