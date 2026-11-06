/** What an import could not carry over, reported once per kind and part. */

export type ImportDiagnostic = {
	severity: "error" | "warning";
	message: string;
	part?: string;
	measure?: string;
};

/** The most measures a grouped diagnostic names. */
const SHOWN = 3;

type Group = { message: string; part: string | undefined; measures: string[] };

export class Losses {
	private readonly groups = new Map<string, Group>();
	private readonly order: (Group | ImportDiagnostic)[] = [];

	/** A loss of `kind` in `measure`; losses of one kind in one part share a diagnostic. */
	add(kind: string, message: string, part?: string, measure?: string): void {
		const key = `${kind}\u0000${part ?? ""}`;
		const group: Group = this.groups.get(key) ?? { message, part, measures: [] };
		if (!this.groups.has(key)) {
			this.groups.set(key, group);
			this.order.push(group);
		}
		group.measures.push(measure ?? "");
	}

	/** A diagnostic that needs no grouping, passed through unchanged. */
	note(d: ImportDiagnostic): void {
		this.order.push(d);
	}

	list(): ImportDiagnostic[] {
		return this.order.map((e) => ("measures" in e ? render(e) : e));
	}
}

function render(g: Group): ImportDiagnostic {
	const named = g.measures.filter((m) => m !== "");
	const out: ImportDiagnostic = { severity: "warning", message: g.message };
	if (g.part !== undefined) out.part = g.part;
	const [first] = named;
	if (first === undefined) return out;
	out.measure = first;
	out.message = `${g.message} in ${measuresText(named)}`;
	return out;
}

/** Where a loss is: "measure 5", or "12 measures: 1, 2, 3, …" (the first few named). */
export function measuresText(measures: string[]): string {
	if (measures.length === 1) return `measure ${measures[0]}`;
	const shown = measures.slice(0, SHOWN).join(", ");
	return `${measures.length} measures: ${shown}${measures.length > SHOWN ? ", …" : ""}`;
}
