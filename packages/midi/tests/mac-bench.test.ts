/**
 * scripts/mac-bench.ts, the environment dorico-midi gives mac-bench. Here
 * because the root `bun test` runs packages/ only.
 */
import { describe, expect, test } from "bun:test";
import { macBenchEnv } from "../../../scripts/mac-bench.js";

describe("the environment dorico-midi gives mac-bench", () => {
	test("leaves out barmark's own 1Password environment, so mac-bench's varlock loads its own", () => {
		const env = macBenchEnv({ OP_ENV_ID: "barmark", OP_TOKEN: "secret", PATH: "/bin", HOME: "/h" });
		expect(env).toEqual({ PATH: "/bin", HOME: "/h" });
	});
});
