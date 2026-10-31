import { CATEGORIES, type Category, type GuideRow } from "./rows.ts";

/** The guide's search, category and sort, as kept in the URL. */
export type GuideQuery = { q: string; cat: Category | null; sort: "name" | "category" };

const isCategory = (value: string | null): value is Category =>
	(CATEGORIES as readonly (string | null)[]).includes(value);

export function readQuery(params: URLSearchParams): GuideQuery {
	const cat = params.get("cat");
	return {
		q: params.get("q") ?? "",
		cat: isCategory(cat) ? cat : null,
		sort: params.get("sort") === "name" ? "name" : "category",
	};
}

/** The query string for a query, leaving out the defaults: "" for none. */
export function writeQuery(query: GuideQuery): string {
	const params = new URLSearchParams();
	if (query.q) params.set("q", query.q);
	if (query.cat) params.set("cat", query.cat);
	if (query.sort !== "category") params.set("sort", query.sort);
	return params.toString();
}

export function matches(row: GuideRow, query: GuideQuery): boolean {
	if (query.cat && row.category !== query.cat) return false;
	const q = query.q.trim().toLowerCase();
	if (!q) return true;
	return [row.syntax, row.meaning, row.category].some((field) => field.toLowerCase().includes(q));
}

export function sorted(rows: GuideRow[], sort: GuideQuery["sort"]): GuideRow[] {
	const copy = [...rows];
	if (sort === "name") return copy.sort((a, b) => a.syntax.localeCompare(b.syntax));
	return copy.sort((a, b) => CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category));
}
