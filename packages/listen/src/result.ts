/** Why a call refused (design §4.1). */
export type RefusalReason =
	| "invalid-input"
	| "invalid-option"
	| "features-invalid"
	| "features-version"
	| "no-period"
	| "downbeat-undecided"
	| "nothing-fits"
	| "no-bars"
	| "no-tempo"
	| "too-short"
	| "too-long"
	| "chart-too-long"
	| "not-same-piece"
	| "bars-off-middle"
	| "bar-one-far"
	| "bar-length-off"
	| "weak-fit"
	| "map-invalid";

/** What a call noticed and carried on past (design §4.2). */
export type WarningCode =
	| "pickup"
	| "bar-one-clamped"
	| "sound-before-start"
	| "grid-truncated"
	| "bar-one-unplaced"
	| "chart-diagnostics";

/** One reason a call refused. */
export type Refusal = {
	reason: RefusalReason;
	/** One sentence in plain words, fit to show a person as it is. */
	message: string;
	/** The numbers behind it, for a page that explains or a study that scores. */
	detail?: Record<string, number | string | boolean>;
};

/** Something a call noticed and carried on past. */
export type ListenWarning = {
	code: WarningCode;
	message: string;
	detail?: Record<string, number | string | boolean>;
};

/** A call that worked. */
export type Ok<T> = { ok: true; value: T; warnings: ListenWarning[] };

/** A call that refused. `refusals` is never empty. */
// biome-ignore lint/complexity/noBannedTypes: `{}` is the empty extra, the spec's own default.
export type Refused<E = {}> = { ok: false; refusals: Refusal[]; warnings: ListenWarning[] } & E;

/** A success carrying `value` and any warnings. */
export function ok<T>(value: T, warnings: ListenWarning[] = []): Ok<T> {
	return { ok: true, value, warnings };
}

/** One refusal reason; `detail` is left off when not given. */
export function refusal(
	reason: RefusalReason,
	message: string,
	detail?: Refusal["detail"],
): Refusal {
	return detail === undefined ? { reason, message } : { reason, message, detail };
}

/** A refusal result: the reasons, any warnings, and `extra` beside them (a reading, say). */
// biome-ignore lint/complexity/noBannedTypes: `{}` is the empty extra, the spec's own default.
export function refused<E extends object = {}>(
	refusals: Refusal[],
	warnings: ListenWarning[] = [],
	extra?: E,
): Refused<E> {
	return { ...extra, ok: false, refusals, warnings } as Refused<E>;
}
