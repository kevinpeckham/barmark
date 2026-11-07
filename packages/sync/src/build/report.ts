import type { Seconds } from "../timing/index.js";
import type { BuildCode, BuildDiagnostic } from "./types.js";

/** Where in the input or the chart a diagnostic points. */
export type Where = { path?: string; at?: Seconds; bar?: number };

type Add = (code: BuildCode, message: string, where?: Where) => void;

/** The diagnostics collected while building, in the order raised. */
export type Report = {
	error: Add;
	warning: Add;
	info: Add;
	readonly list: BuildDiagnostic[];
};

export function createReport(): Report {
	const list: BuildDiagnostic[] = [];
	const adder =
		(severity: BuildDiagnostic["severity"]): Add =>
		(code, message, where = {}) => {
			const d: BuildDiagnostic = { severity, code, message };
			if (where.path !== undefined) d.path = where.path;
			if (where.at !== undefined) d.at = where.at;
			if (where.bar !== undefined) d.bar = where.bar;
			list.push(d);
		};
	return { error: adder("error"), warning: adder("warning"), info: adder("info"), list };
}
