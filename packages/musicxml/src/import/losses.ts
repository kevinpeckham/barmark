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
	if (named.length === 1) out.message = `${g.message} in measure ${first}`;
	else {
		const shown = named.slice(0, SHOWN).join(", ");
		out.message = `${g.message} in ${named.length} measures: ${shown}${named.length > SHOWN ? ", …" : ""}`;
	}
	return out;
}
