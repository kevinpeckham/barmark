#!/usr/bin/env node
/** The barmark command under Node: the bin npm installs. */
import { main } from "./main.js";
import { nodeIo } from "./node-io.js";

process.exitCode = await main(process.argv.slice(2), nodeIo());
