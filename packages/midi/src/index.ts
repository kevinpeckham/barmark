// @barmark/midi: exportMidi and importMidi, the SMF reader, and the performance's types (its functions are @barmark/midi/perform).
export type { MidiExportOptions, MidiExportResult } from "./export/index.js";
export { exportMidi } from "./export/index.js";
export { importMidi } from "./import/index.js";
export type {
	MidiImportCode,
	MidiImportDiagnostic,
	MidiImportOptions,
	MidiImportResult,
} from "./import/types.js";
export type * from "./perform/types.js";
export { readSmf, type SmfRead } from "./smf/read.js";
export type { Smf, SmfEvent } from "./smf/types.js";
export { VERSION } from "./version.js";
