// Vercel Web Analytics, injected once per client load (src/lib/analytics.ts).
import "#lib/analytics.js";

// Every page is rendered at build: barmark.dev needs no server at request time.
export const prerender = true;
