import type { BeforeSendEvent } from "@vercel/analytics";

/** Analytics sees the page, never its query: /try and /syntax keep what the reader typed in ?q=. */
export function withoutQuery(event: BeforeSendEvent): BeforeSendEvent {
	const url = new URL(event.url);
	return { ...event, url: url.origin + url.pathname };
}
