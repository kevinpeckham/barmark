import { inject, pageview } from "@vercel/analytics";
import { withoutQuery } from "#lib/without-query.js";
import { browser, dev } from "$app/env";

/**
 * Vercel Web Analytics: page views by route, no cookies. Stem Shovel's
 * pattern (its src/lib/observability.ts): the package's `/sveltekit` entry
 * reads `$app/stores`, which SvelteKit 3 removed, so this injects the
 * generic entry once, from the root +layout.ts, and the root layout reports
 * each route through `trackRoute`.
 */

/** Vercel sets these at build on its own deployments; absent elsewhere. */
const basePath = import.meta.env.VITE_VERCEL_OBSERVABILITY_BASEPATH as string | undefined;
const clientConfig = import.meta.env.VITE_VERCEL_OBSERVABILITY_CLIENT_CONFIG as string | undefined;

if (browser)
	inject(
		{
			mode: dev ? "development" : "production",
			beforeSend: withoutQuery,
			basePath,
			disableAutoTrack: true,
			framework: "sveltekit",
		},
		clientConfig,
	);

/** The root layout calls this after every navigation, and the first render. */
export function trackRoute(route: string | null, path: string): void {
	if (route) pageview({ route, path });
}
