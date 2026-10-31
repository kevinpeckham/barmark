# Edwin

`Edwin-Roman.otf` is the roman of **Edwin**, MuseScore's text font for
music, shipped here **unmodified** (byte for byte; `tests/font.test.ts`
checks its SHA-256).

- Source: <https://github.com/musescore/MuseScore/tree/c66993b7c9674ad35a05a30b685b04edb3471c07/fonts/edwin>
- Copyright (c) 2021, MuseScore Limited, with Reserved Font Name "Edwin".
- Licence: SIL Open Font License 1.1, in `OFL.txt` (MuseScore's
  `LICENSE.txt`).

The Reserved Font Name means a modified version, including a subset or a
format conversion, may not be called Edwin, so this package never alters
the file. `@barmark/render` registers it under the CSS family name
"barmark Edwin" so it cannot collide with a page's own fonts; the font
itself is unchanged.
