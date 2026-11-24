/** The timing tests' helper measures again before it lets a test fail (`test-support/growth.ts`). */
import { expect, test } from "bun:test";
import { growth, settled } from "../../../test-support/growth.js";

/** A measure that answers from a list, counting its calls. */
const scripted = (answers: number[]) => {
	let calls = 0;
	return { measure: () => answers[calls++] as number, calls: () => calls };
};

test("a measurement under the limit is taken at once", () => {
	const one = scripted([10, 99]);
	expect(settled(one.measure, 20)).toBe(10);
	expect(one.calls()).toBe(1);
});

test("a measurement over the limit is taken again, and a spike of load does not fail the test", () => {
	const spike = scripted([25, 12, 99]);
	expect(settled(spike.measure, 20)).toBe(12);
	expect(spike.calls()).toBe(2);
});

test("growth that is really there shows in every measurement, and still fails", () => {
	const quadratic = scripted([96, 104, 99, 1]);
	expect(settled(quadratic.measure, 20)).toBe(96);
	expect(quadratic.calls()).toBe(3);
});

test("growth with a limit answers a ratio, as without one", () => {
	const work = () => {
		let sum = 0;
		for (let k = 0; k < 20_000; k++) sum += k;
		return sum;
	};
	expect(growth(work, work, { under: 1e9 })).toBeGreaterThan(0);
});
