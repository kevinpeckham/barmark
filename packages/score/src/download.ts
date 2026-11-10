/**
 * Downloading a Verovio module with progress, and checking its digest.
 * Verovio-free: the worker uses it before any Verovio is loaded.
 */

/**
 * How far a download has come: `fraction` from 0 to 1, or null when it
 * cannot be known; `bytes` only when its total is the real transfer size.
 */
export type Download = {
	phase: "download";
	fraction: number | null;
	bytes: { done: number; total: number } | null;
};

const unknown = (): Download => ({ phase: "download", fraction: null, bytes: null });

const lengthOf = (headers: Headers): number | null => {
	const n = Number(headers.get("content-length") ?? "");
	return Number.isSafeInteger(n) && n > 0 ? n : null;
};

const encoded = (headers: Headers) => {
	const e = headers.get("content-encoding")?.trim().toLowerCase();
	return e !== undefined && e !== "" && e !== "identity";
};

/**
 * Measures a download whose body arrives decoded. With Content-Encoding,
 * Content-Length is the compressed size, so decoded bytes are measured
 * against it only when the response is not encoded; otherwise against
 * `expected`, the module's decoded size, when known; otherwise not at all.
 * A `crossOrigin` response hides Content-Encoding unless the server
 * exposes it, so there a length short of `expected` is taken as
 * compressed. A body that outgrows the length it is measured against is
 * measured by the next rule.
 */
export function downloadMeter(
	headers: Headers,
	expected?: number,
	crossOrigin = false,
): (decoded: number) => Download {
	const given = lengthOf(headers);
	const hidden = crossOrigin && expected !== undefined && given !== null && given < expected;
	const length = encoded(headers) || hidden ? null : given;
	const byExpected = (done: number): Download =>
		expected !== undefined && done <= expected
			? { phase: "download", fraction: done / expected, bytes: null }
			: unknown();
	return (done) =>
		length !== null && done <= length
			? { phase: "download", fraction: done / length, bytes: { done, total: length } }
			: byExpected(done);
}

const mb = (n: number) => (n / 1_000_000).toFixed(1);

/** "42%", with "(3.1 of 7.4 MB)" when the total is the real transfer size; "" when unknown. */
export function progressText(d: Download): string {
	if (d.fraction === null) return "";
	const percent = `${Math.floor(d.fraction * 100)}%`;
	return d.bytes ? `${percent} (${mb(d.bytes.done)} of ${mb(d.bytes.total)} MB)` : percent;
}

const SRI = /^(sha256|sha384|sha512)-([A-Za-z0-9+/]+={0,2})$/;

/** Whether `integrity` is one SRI digest this package checks: sha256, sha384 or sha512. */
export const isIntegrity = (integrity: string) => SRI.test(integrity.trim());

const base64 = (buffer: ArrayBuffer) => {
	let s = "";
	for (const b of new Uint8Array(buffer)) s += String.fromCharCode(b);
	return btoa(s);
};

/** Whether `bytes` have the SRI digest `integrity` (`sha384-…`); anything else fails. */
export async function checkIntegrity(bytes: BufferSource, integrity: string): Promise<boolean> {
	const m = SRI.exec(integrity.trim());
	if (!m) return false;
	const alg = `SHA-${(m[1] as string).slice(3)}`;
	return base64(await crypto.subtle.digest(alg, bytes)) === m[2];
}

/** How often an unmeasurable download reports: every this many bytes. */
const UNKNOWN_STEP = 512 * 1024;

/** Reports a download only when its whole percentage moves, or (unmeasured) every UNKNOWN_STEP bytes. */
function throttled(report: (d: Download) => void) {
	let last: number | null = null;
	return (d: Download, done: number) => {
		const mark =
			d.fraction === null ? -1 - Math.floor(done / UNKNOWN_STEP) : Math.floor(d.fraction * 100);
		if (mark === last) return;
		last = mark;
		report(d);
	};
}

export type FetchModuleOptions = {
	fetch: (url: string) => Promise<Response>;
	onProgress: (d: Download) => void;
	/** The SRI digest the module must have; checked before it is returned. */
	integrity?: string;
	/** The module's decoded size, when known. */
	expected?: number;
};

/** Downloads the module at `url` with progress, as a JavaScript blob ready to import from an object URL. */
export async function fetchModule(url: string, options: FetchModuleOptions): Promise<Blob> {
	const response = await options.fetch(url);
	if (!response.ok) throw new Error(`${response.status} ${response.statusText}`.trim());
	const meter = downloadMeter(response.headers, options.expected, response.type === "cors");
	const report = throttled(options.onProgress);
	const chunks: Uint8Array[] = [];
	let done = 0;
	report(meter(0), 0);
	const reader = response.body?.getReader();
	for (let r = await reader?.read(); r && !r.done; r = await reader?.read()) {
		chunks.push(r.value);
		done += r.value.byteLength;
		report(meter(done), done);
	}
	const blob = new Blob(chunks as BlobPart[], { type: "text/javascript" });
	if (options.integrity !== undefined) {
		if (!(await checkIntegrity(await blob.arrayBuffer(), options.integrity)))
			throw new Error(`${url} does not match its integrity digest`);
	}
	return blob;
}
