import { expect, test } from "bun:test";
import { PALETTES } from "../../render/src/styles.js";
import { SWITCH_PALETTES } from "../src/switch.js";

test("the switch's colours are render's palettes", () => {
	for (const theme of ["light", "dark"] as const)
		expect(SWITCH_PALETTES[theme]).toEqual({
			ink: PALETTES[theme].ink,
			rule: PALETTES[theme].rule,
		});
});
