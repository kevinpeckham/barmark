/**
 * The FFT, ported from the app's `audio/analysis.ts` (`fft`), arithmetic
 * in the app's order so its results are the app's bit for bit. Fixed, not
 * an option (design 5.3): a change to what this computes bumps
 * `FEATURES_VERSION`.
 *
 * It assumes a validated length, a power of two its callers fix; the stage
 * entry points guard what reaches it and refuse instead.
 */

/** Reorders `re` and `im` in place into bit-reversed index order. */
function bitReverse(re: Float32Array, im: Float32Array): void {
	const n = re.length;
	for (let i = 1, j = 0; i < n; i++) {
		let bit = n >> 1;
		for (; j & bit; bit >>= 1) j ^= bit;
		j ^= bit;
		if (i < j) {
			[re[i], re[j]] = [re[j] as number, re[i] as number];
			[im[i], im[j]] = [im[j] as number, im[i] as number];
		}
	}
}

/** One butterfly stage of length `len` over the whole array. */
function butterflies(re: Float32Array, im: Float32Array, len: number): void {
	const n = re.length;
	const ang = (-2 * Math.PI) / len;
	const wr = Math.cos(ang);
	const wi = Math.sin(ang);
	for (let i = 0; i < n; i += len) {
		let cr = 1;
		let ci = 0;
		for (let k = 0; k < len / 2; k++) {
			const a = i + k;
			const b = a + len / 2;
			const tr = (re[b] as number) * cr - (im[b] as number) * ci;
			const ti = (re[b] as number) * ci + (im[b] as number) * cr;
			re[b] = (re[a] as number) - tr;
			im[b] = (im[a] as number) - ti;
			re[a] = (re[a] as number) + tr;
			im[a] = (im[a] as number) + ti;
			const ncr = cr * wr - ci * wi;
			ci = cr * wi + ci * wr;
			cr = ncr;
		}
	}
}

/** In-place radix-2 FFT; `re.length` must be a power of two (the app's `fft`). */
export function fft(re: Float32Array, im: Float32Array): void {
	bitReverse(re, im);
	for (let len = 2; len <= re.length; len <<= 1) butterflies(re, im, len);
}
