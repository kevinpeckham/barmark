import { expect, test } from "bun:test";
import type stockFactory from "verovio/wasm";
import type engraverFactory from "../src/index.d.mts";

// Each factory is assignable to the other: score's worker takes either without a branch.
const a: typeof stockFactory = null as unknown as typeof engraverFactory;
const b: typeof engraverFactory = null as unknown as typeof stockFactory;
test("the module's types are verovio/wasm's, plus instantiateWasm", () =>
	expect([a, b]).toHaveLength(2));
