# @barmark/musicxml

Export [barmark](https://barmark.dev) chord charts to MusicXML 4.0, so a
chart opens in MuseScore, Dorico, Sibelius or Finale.

```sh
npm install @barmark/musicxml
```

```ts
import { exportMusicXml } from "@barmark/musicxml";

const result = exportMusicXml(text);
if (result.ok) save(result.xml);
else console.error(result.diagnostics);
```

## License

MIT
