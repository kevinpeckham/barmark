import { VerovioToolkit } from "verovio/esm";
import createVerovioModule from "verovio/wasm";

/** A fresh Verovio toolkit, for tests and for the scripts that engrave. */
export async function loadToolkit(): Promise<VerovioToolkit> {
	return new VerovioToolkit(await createVerovioModule());
}
