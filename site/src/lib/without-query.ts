/**
 * Analytics and Speed Insights see the page, never its query: /try and
 * /syntax keep what the reader typed in ?q=. Typed for either package's
 * events: each carries a url, and keeps everything else.
 */
export function withoutQuery<E extends { url: string }>(event: E): E {
	const url = new URL(event.url);
	return { ...event, url: url.origin + url.pathname };
}
