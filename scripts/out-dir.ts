/**
 * Output folders for the VM-only scripts, safe in a shared /tmp: a default
 * folder is new and private (mkdtemp, mode 0700), a given one must be a real
 * folder we own, and each file is created afresh rather than written through
 * whatever already sits at its path (a planted symlink is removed, not followed).
 */
import { lstatSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/** `arg` (made if missing; refused unless a folder we own), or a new private folder named `prefix…` under tmpdir. */
export function outDir(arg: string | undefined, prefix: string): string {
	if (arg === undefined) return mkdtempSync(join(tmpdir(), prefix));
	const dir = resolve(arg);
	mkdirSync(dir, { recursive: true });
	const st = lstatSync(dir);
	if (!st.isDirectory()) throw new Error(`${dir} is not a folder`);
	if (process.getuid && st.uid !== process.getuid()) throw new Error(`${dir} is not ours`);
	return dir;
}

/** `data` in a new file at `path`: whatever was there is removed first, and the create is exclusive. */
export function writeFresh(path: string, data: string): void {
	rmSync(path, { force: true });
	writeFileSync(path, data, { flag: "wx" });
}
