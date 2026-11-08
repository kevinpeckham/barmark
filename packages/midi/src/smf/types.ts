/** One event of a Standard MIDI File track, at an absolute tick. */
export type SmfEvent = { tick: number } & (
	| { kind: "on" | "off"; channel: number; pitch: number; velocity: number }
	| { kind: "program"; channel: number; program: number }
	| { kind: "control"; channel: number; control: number; value: number }
	| { kind: "meta"; type: number; data: Uint8Array }
);

/** A Standard MIDI File: its format, its division (ticks a quarter) and its tracks. */
export type Smf = { format: 0 | 1; ppq: number; tracks: SmfEvent[][] };
