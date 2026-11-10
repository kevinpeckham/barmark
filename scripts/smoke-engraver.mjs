/**
 * Load @barmark/engraver as Node sees it: check that the module and its
 * .wasm have the sizes and sha384 digests info.js names, instantiate the
 * module with no options (so it finds its own .wasm) and engrave a
 * one-measure MusicXML score into SVG. Plain Node, so it runs against the
 * local build (scripts/verify-package.ts) and against the copy installed
 * from npm.
 *
 *   node scripts/smoke-engraver.mjs <module> [chart]
 *
 * <module> is a path to dist/verovio-module.mjs or a bare specifier
 * ("@barmark/engraver"), resolved from this file's directory. The chart is
 * accepted, as every smoke script takes one, and ignored: the package
 * cannot read charts. Prints the result as JSON; exit 1 if anything differs.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const [spec] = process.argv.slice(2);
const local = spec.startsWith(".") || spec.startsWith("/") || existsSync(spec);
const moduleUrl = local ? pathToFileURL(resolve(spec)).href : import.meta.resolve(spec);
const wasmUrl = local
	? new URL("./verovio-module.wasm", moduleUrl).href
	: import.meta.resolve(`${spec}/verovio-module.wasm`);
const infoUrl = local ? new URL("./info.js", moduleUrl).href : import.meta.resolve(`${spec}/info`);

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note>
    </measure>
  </part>
</score-partwise>
`;

const sri = (bytes) => `sha384-${createHash("sha384").update(bytes).digest("base64")}`;

const result = { version: "", moduleBytes: 0, wasmBytes: 0, digests: false, svg: false };
try {
	const info = await import(infoUrl);
	const moduleBytes = readFileSync(fileURLToPath(moduleUrl));
	const wasmBytes = readFileSync(fileURLToPath(wasmUrl));
	result.moduleBytes = moduleBytes.length;
	result.wasmBytes = wasmBytes.length;
	result.digests =
		moduleBytes.length === info.MODULE_BYTES &&
		wasmBytes.length === info.WASM_BYTES &&
		sri(moduleBytes) === info.MODULE_INTEGRITY &&
		sri(wasmBytes) === info.WASM_INTEGRITY;

	// The toolkit's own calls, as verovio/dist/verovio.mjs's proxy wraps them.
	const { default: createModule } = await import(moduleUrl);
	const mod = await createModule();
	const make = mod.cwrap("vrvToolkit_constructor", "number", []);
	const getVersion = mod.cwrap("vrvToolkit_getVersion", "string", ["number"]);
	const loadData = mod.cwrap("vrvToolkit_loadData", "number", ["number", "string"]);
	const renderToSVG = mod.cwrap("vrvToolkit_renderToSVG", "string", ["number", "number", "number"]);
	const vrv = make();
	result.version = getVersion(vrv);
	result.svg = Boolean(loadData(vrv, XML)) && renderToSVG(vrv, 1, 0).includes("<svg");
} catch (error) {
	result.error = String(error?.stack ?? error);
}
console.log(JSON.stringify(result));
process.exit(result.digests && result.svg && /^6\.4\.1(-|$)/.test(result.version) ? 0 : 1);
