/** A sine of `hz` for `seconds` at `rate`, `gain` 1 unless given. */
export function sine(hz: number, seconds: number, rate: number, gain = 1): Float32Array {
	return Float32Array.from(
		{ length: Math.round(seconds * rate) },
		(_, i) => gain * Math.sin((2 * Math.PI * hz * i) / rate),
	);
}

/** `seconds` of zeros at `rate`. */
export function silence(seconds: number, rate: number): Float32Array {
	return new Float32Array(Math.round(seconds * rate));
}

/** The parts one after another. */
export function concat(...parts: Float32Array[]): Float32Array {
	const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
	let at = 0;
	for (const part of parts) {
		out.set(part, at);
		at += part.length;
	}
	return out;
}
