import { expect, test } from "bun:test";
import type stockFactory from "verovio/wasm";
import type engraverFactory from "../src/index.d.mts";

// Each factory is assignable to the other: score's worker takes either without a branch.
const a: typeof stockFactory = null as unknown as typeof engraverFactory;
const b: typeof engraverFactory = null as unknown as typeof stockFactory;
// Mutual assignability cannot see an optional member, so name instantiateWasm:
// this fails to compile if the options type ever loses it.
type Options = NonNullable<Parameters<typeof engraverFactory>[0]>;
const hook: NonNullable<Options["instantiateWasm"]> = null as never;
test("the module's types are verovio/wasm's, plus instantiateWasm", () =>
	expect([a, b, hook]).toHaveLength(3));
