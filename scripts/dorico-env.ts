/**
 * The environment `scripts/dorico-midi.ts` gives mac-bench. Bun loads
 * barmark's `.env.local` into the script, and its `OP_ENV_ID` and
 * `OP_TOKEN` name barmark's own 1Password environment: passed on, they
 * would point mac-bench's varlock there, which has no `MAC_BENCH_TOKEN`
 * (FINDINGS 2026-11-08).
 */
export function macBenchEnv(env: Record<string, string | undefined>): Record<string, string> {
	const out: Record<string, string> = {};
	for (const [key, value] of Object.entries(env))
		if (value !== undefined && key !== "OP_ENV_ID" && key !== "OP_TOKEN") out[key] = value;
	return out;
}
