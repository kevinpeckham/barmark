# @barmark/score

Shows a [barmark](https://github.com/kevinpeckham/barmark) chord chart as
a full engraved score: the chart is exported to MusicXML by
`@barmark/musicxml` and engraved by Verovio. The score adds no music of
its own.

```
npm install @barmark/score
```

```js
import createVerovioModule from "verovio/wasm";
import { VerovioToolkit } from "verovio/esm";
import { engraveChart } from "@barmark/score";

const vrv = new VerovioToolkit(await createVerovioModule());
const result = engraveChart(vrv, chartText, { width: 800 });
if (result.ok) document.body.innerHTML = result.svg;
```

## Licence

This package is MIT. It uses [Verovio](https://www.verovio.org) under the
LGPL-3.0 ([licence](https://github.com/rism-digital/verovio/blob/develop/COPYING.LESSER));
Verovio's code is never copied or modified here.
