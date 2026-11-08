/** Channels (spec 3.3): each track its own, skipping General MIDI's drums. */
import type { PerformedTrack } from "../perform/types.js";

/** Channel indices 0–8 and 10–15: channel 10 (index 9) is General MIDI's drums, never written. */
const CHANNELS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15];

/**
 * Each track's channel index, in track order. Up to 15 tracks each get
 * their own. Beyond that a part's line tracks share one channel (keyed
 * on the part's label, as two parts may share a name, grammar 7.4), and
 * its harmony track, on piano, keeps another, so no line plays the
 * other's program; with more such groups than 15, channels repeat in
 * turn. `shared` is true when any channel carries two tracks.
 */
export function assignChannels(tracks: PerformedTrack[]): { channels: number[]; shared: boolean } {
	if (tracks.length <= CHANNELS.length)
		return { channels: tracks.map((_, i) => CHANNELS[i] as number), shared: false };
	const groups = new Map<string, number>();
	const channels = tracks.map((t, i) => {
		const key = t.part === null ? `track ${i}` : `${t.role} ${t.part}`;
		const group = groups.get(key) ?? groups.size;
		groups.set(key, group);
		return CHANNELS[group % CHANNELS.length] as number;
	});
	return { channels, shared: true };
}
