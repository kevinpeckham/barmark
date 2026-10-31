/** What the verify scripts share: the repo root and a synchronous command runner. */
import { join } from "node:path";

export const root = join(import.meta.dir, "..");

export const run = (cmd: string[]) => {
	const r = Bun.spawnSync(cmd, { cwd: root, stdout: "pipe", stderr: "pipe" });
	return { code: r.exitCode, out: r.stdout.toString().trim(), err: r.stderr.toString().trim() };
};
