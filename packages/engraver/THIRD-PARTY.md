# Third-party notices

`@barmark/engraver` is a modified build of Verovio 6.4.1 (LGPL-3.0-only;
`COPYING`, `COPYING.LESSER`, `NOTICE.md`). The compiled files,
`dist/verovio-module.mjs` and `dist/verovio-module.wasm`, also hold the code
and data below. Each notice is copied from the source it names; an indented
block is quoted verbatim.

## Emscripten 7.0.0

The glue (`verovio-module.mjs`) and the C and C++ runtime in the `.wasm`
come from Emscripten, built with emsdk 7.0.0 (commit
`1693ce7359fc9694f198694f902a2cc061239b86`). Emscripten is offered under
the MIT license and the University of Illinois/NCSA Open Source License.
From `upstream/emscripten/LICENSE` in that emsdk:

    Emscripten is available under 2 licenses, the MIT license and the
    University of Illinois/NCSA Open Source License.

    Both are permissive open source licenses, with little if any
    practical difference between them.

    The reason for offering both is that (1) the MIT license is
    well-known, while (2) the University of Illinois/NCSA Open Source
    License allows Emscripten's code to be integrated upstream into
    LLVM, which uses that license, should the opportunity arise.

    The full text of both licenses follows.

    ==============================================================================

    Copyright (c) 2010-2014 Emscripten authors, see AUTHORS file.

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in
    all copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
    THE SOFTWARE.

    ==============================================================================

    Copyright (c) 2010-2014 Emscripten authors, see AUTHORS file.
    All rights reserved.

    Permission is hereby granted, free of charge, to any person obtaining a
    copy of this software and associated documentation files (the
    "Software"), to deal with the Software without restriction, including
    without limitation the rights to use, copy, modify, merge, publish,
    distribute, sublicense, and/or sell copies of the Software, and to
    permit persons to whom the Software is furnished to do so, subject to
    the following conditions:

        Redistributions of source code must retain the above copyright
        notice, this list of conditions and the following disclaimers.

        Redistributions in binary form must reproduce the above
        copyright notice, this list of conditions and the following disclaimers
        in the documentation and/or other materials provided with the
        distribution.

        Neither the names of Mozilla,
        nor the names of its contributors may be used to endorse
        or promote products derived from this Software without specific prior
        written permission. 

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
    OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
    MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
    IN NO EVENT SHALL THE CONTRIBUTORS OR COPYRIGHT HOLDERS BE LIABLE FOR
    ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
    TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
    SOFTWARE OR THE USE OR OTHER DEALINGS WITH THE SOFTWARE.

    ==============================================================================

    This program uses portions of Node.js source code located in src/library_path.js,
    in accordance with the terms of the MIT license. Node's license follows:

        """
            Copyright Joyent, Inc. and other Node contributors. All rights reserved.
            Permission is hereby granted, free of charge, to any person obtaining a copy
            of this software and associated documentation files (the "Software"), to
            deal in the Software without restriction, including without limitation the
            rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
            sell copies of the Software, and to permit persons to whom the Software is
            furnished to do so, subject to the following conditions:

            The above copyright notice and this permission notice shall be included in
            all copies or substantial portions of the Software.

            THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
            IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
            FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
            AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
            LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
            FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
            IN THE SOFTWARE.
        """

    The musl libc project is bundled in this repo, and it has the MIT license, see
    system/lib/libc/musl/COPYRIGHT

    The third_party/ subdirectory contains code with other licenses. None of it is
    used by default, but certain options use it (e.g., the optional closure compiler
    flag will run closure compiler from third_party/).

### musl

Emscripten's C library is musl (MIT). From
`upstream/emscripten/system/lib/libc/musl/COPYRIGHT`:

    musl as a whole is licensed under the following standard MIT license:

    ----------------------------------------------------------------------
    Copyright © 2005-2020 Rich Felker, et al.

    Permission is hereby granted, free of charge, to any person obtaining
    a copy of this software and associated documentation files (the
    "Software"), to deal in the Software without restriction, including
    without limitation the rights to use, copy, modify, merge, publish,
    distribute, sublicense, and/or sell copies of the Software, and to
    permit persons to whom the Software is furnished to do so, subject to
    the following conditions:

    The above copyright notice and this permission notice shall be
    included in all copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
    EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
    MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
    IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
    CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
    TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
    SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

The full file, with its list of contributors and the notices of the parts
musl took from elsewhere, is in that emsdk.

### libc++, libc++abi and compiler-rt

Emscripten's C++ library (libc++, libc++abi) and its compiler runtime
(compiler-rt) are part of the LLVM Project, under the Apache License v2.0
with LLVM Exceptions (`Apache-2.0 WITH LLVM-exception`). The exception means
a binary built with them needs no attribution; they are named here so the
build's contents are complete. The licence text is
`upstream/emscripten/system/lib/libcxx/LICENSE.TXT` and
`upstream/emscripten/system/lib/compiler-rt/LICENSE.TXT` in that emsdk.

## Libraries Verovio vendors, compiled into this build

Verovio 6.4.1 carries these libraries in its own repository (its README,
"Embedded libraries"). With this build's options
(`-DNO_HUMDRUM_SUPPORT=ON` and the other importers off), Verovio's CMake
compiles all of them except humlib, which is left out (`src/hum/` is not
compiled). miniz-cpp is still compiled: `src/filereader.cpp` includes it,
and Verovio reads zipped fonts with it.

### pugixml (MIT)

`include/pugi/pugixml.hpp`, Verovio `version-6.4.1`:

    Copyright (c) 2006-2026 Arseny Kapoulkine

    Permission is hereby granted, free of charge, to any person
    obtaining a copy of this software and associated documentation
    files (the "Software"), to deal in the Software without
    restriction, including without limitation the rights to use,
    copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the
    Software is furnished to do so, subject to the following
    conditions:

    The above copyright notice and this permission notice shall be
    included in all copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
    EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
    OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
    NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
    HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
    WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
    FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
    OTHER DEALINGS IN THE SOFTWARE.

### JSON++ (jsonxx, MIT)

`include/json/LICENSE`, Verovio `version-6.4.1` (Verovio's copy is modified
by Laurent Pugin, as `include/json/jsonxx.h` records):

    Copyright (c) 2010 Hong Jiang

    Permission is hereby granted, free of charge, to any person
    obtaining a copy of this software and associated documentation
    files (the "Software"), to deal in the Software without
    restriction, including without limitation the rights to use,
    copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the
    Software is furnished to do so, subject to the following
    conditions:

    The above copyright notice and this permission notice shall be
    included in all copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
    EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
    OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
    NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
    HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
    WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
    FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
    OTHER DEALINGS IN THE SOFTWARE.

### MidiFile (BSD-2-Clause)

By Craig Stuart Sapp, https://github.com/craigsapp/midifile, in Verovio's
`include/midi/` and `src/midi/`. Verovio's copy carries no licence file;
this is `LICENSE.txt` from that repository (commit
`72ad5e6d024d47c6234ec970e730c6406374d6f5`):

    Copyright (c) 1999-2018, Craig Stuart Sapp
    All rights reserved.

    Redistribution and use in source and binary forms, with or without
    modification, are permitted provided that the following conditions are met:

    1. Redistributions of source code must retain the above copyright notice, this
       list of conditions and the following disclaimer. 
    2. Redistributions in binary form must reproduce the above copyright notice,
       and the following disclaimer in the documentation and/or other materials 
       provided with the distribution.

    THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
    ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
    WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
    DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR
    ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
    (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
    LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
    ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
    (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
    SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

### CRC (public domain)

`include/crc/crc.h`, Verovio `version-6.4.1`:

    Copyright (c) 2000 by Michael Barr.  This software is placed into
    the public domain and may be used for any purpose.  However, this
    notice must not be changed or removed and no warranty is either
    expressed or implied by its publication or distribution.

### miniz-cpp and miniz (MIT)

`include/zip/zip_file.hpp`, Verovio `version-6.4.1`, copied by Verovio from
https://github.com/kkzi/miniz-cpp. Its notice for miniz-cpp:

    Copyright (c) 2014-2017 Thomas Fussell

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in
    all copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, WRISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
    THE SOFTWARE

    @license: http://www.opensource.org/licenses/mit-license.php

and, in the same file, for the miniz it contains (the last of its four
miniz notices, which names every holder the others do):

    Copyright 2013-2014 RAD Game Tools and Valve Software
    Copyright 2010-2014 Rich Geldreich and Tenacious Software LLC
    Copyright 2016 Martin Raiber
    All Rights Reserved.

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in
    all copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
    THE SOFTWARE.

### tuning-library (MIT)

By Paul Walker (the Surge Synth Team),
https://github.com/surge-synthesizer/tuning-library, header-only, used by
Verovio's `src/customtuning.cpp`. `include/tuning-library/LICENSE.md`,
Verovio `version-6.4.1`:

    Copyright 2019-2020, Paul Walker

    Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

### LibMEI (MIT)

Verovio's attribute classes (`libmei/dist/`, `libmei/addons/`) are
generated with a modified LibMEI, which its README in Verovio's repository
says "is released under the MIT license". The generated code is part of
Verovio's source and is distributed here under Verovio's licence.

## Data

- `data/text/` (the Times metrics Verovio lays text out with:
  `Times.xml`, `Times-bold.xml`, `Times-italic.xml`,
  `Times-bold-italic.xml`) is **Verovio-derived data under Verovio's
  licence** (LGPL-3.0-only), not a font and not under the OFL.
- `Leipzig/`, `Leipzig.xml`, `Leipzig.css` and `Bravura.xml` derive from
  the Leipzig and Bravura fonts, under the SIL Open Font License 1.1: see
  `OFL.txt`.
