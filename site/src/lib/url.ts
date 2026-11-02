import { goto } from "$app/navigation";

/** How long the query must stay put before it is written; Safari refuses rapid history writes. */
export const URL_PAUSE_MS = 300;

/**
 * Writes a page's query into its URL, without a history entry, once it has
 * stayed put for URL_PAUSE_MS. Returns the cancel, for an $effect to return.
 */
export function keepQuery(search: string): () => void {
	const timer = setTimeout(() => {
		void goto(search ? `?${search}` : location.pathname, { replace: true, shallow: true });
	}, URL_PAUSE_MS);
	return () => clearTimeout(timer);
}
