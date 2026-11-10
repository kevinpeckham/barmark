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

### libunwind (Apache-2.0 WITH LLVM-exception)

The build uses WebAssembly exceptions (`-fwasm-exceptions`), for which
Emscripten links its port of LLVM's libunwind (`libunwind-legacyexcept.a`,
from `upstream/emscripten/system/lib/libunwind/`). It is part of the LLVM
Project, under the Apache License v2.0 with LLVM Exceptions
(`Apache-2.0 WITH LLVM-exception`); its `LICENSE.TXT` in that emsdk, which
is the same text as libc++'s and compiler-rt's apart from the library's
name:

    ==============================================================================
    The LLVM Project is under the Apache License v2.0 with LLVM Exceptions:
    ==============================================================================

                                     Apache License
                               Version 2.0, January 2004
                            http://www.apache.org/licenses/

        TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

        1. Definitions.

          "License" shall mean the terms and conditions for use, reproduction,
          and distribution as defined by Sections 1 through 9 of this document.

          "Licensor" shall mean the copyright owner or entity authorized by
          the copyright owner that is granting the License.

          "Legal Entity" shall mean the union of the acting entity and all
          other entities that control, are controlled by, or are under common
          control with that entity. For the purposes of this definition,
          "control" means (i) the power, direct or indirect, to cause the
          direction or management of such entity, whether by contract or
          otherwise, or (ii) ownership of fifty percent (50%) or more of the
          outstanding shares, or (iii) beneficial ownership of such entity.

          "You" (or "Your") shall mean an individual or Legal Entity
          exercising permissions granted by this License.

          "Source" form shall mean the preferred form for making modifications,
          including but not limited to software source code, documentation
          source, and configuration files.

          "Object" form shall mean any form resulting from mechanical
          transformation or translation of a Source form, including but
          not limited to compiled object code, generated documentation,
          and conversions to other media types.

          "Work" shall mean the work of authorship, whether in Source or
          Object form, made available under the License, as indicated by a
          copyright notice that is included in or attached to the work
          (an example is provided in the Appendix below).

          "Derivative Works" shall mean any work, whether in Source or Object
          form, that is based on (or derived from) the Work and for which the
          editorial revisions, annotations, elaborations, or other modifications
          represent, as a whole, an original work of authorship. For the purposes
          of this License, Derivative Works shall not include works that remain
          separable from, or merely link (or bind by name) to the interfaces of,
          the Work and Derivative Works thereof.

          "Contribution" shall mean any work of authorship, including
          the original version of the Work and any modifications or additions
          to that Work or Derivative Works thereof, that is intentionally
          submitted to Licensor for inclusion in the Work by the copyright owner
          or by an individual or Legal Entity authorized to submit on behalf of
          the copyright owner. For the purposes of this definition, "submitted"
          means any form of electronic, verbal, or written communication sent
          to the Licensor or its representatives, including but not limited to
          communication on electronic mailing lists, source code control systems,
          and issue tracking systems that are managed by, or on behalf of, the
          Licensor for the purpose of discussing and improving the Work, but
          excluding communication that is conspicuously marked or otherwise
          designated in writing by the copyright owner as "Not a Contribution."

          "Contributor" shall mean Licensor and any individual or Legal Entity
          on behalf of whom a Contribution has been received by Licensor and
          subsequently incorporated within the Work.

        2. Grant of Copyright License. Subject to the terms and conditions of
          this License, each Contributor hereby grants to You a perpetual,
          worldwide, non-exclusive, no-charge, royalty-free, irrevocable
          copyright license to reproduce, prepare Derivative Works of,
          publicly display, publicly perform, sublicense, and distribute the
          Work and such Derivative Works in Source or Object form.

        3. Grant of Patent License. Subject to the terms and conditions of
          this License, each Contributor hereby grants to You a perpetual,
          worldwide, non-exclusive, no-charge, royalty-free, irrevocable
          (except as stated in this section) patent license to make, have made,
          use, offer to sell, sell, import, and otherwise transfer the Work,
          where such license applies only to those patent claims licensable
          by such Contributor that are necessarily infringed by their
          Contribution(s) alone or by combination of their Contribution(s)
          with the Work to which such Contribution(s) was submitted. If You
          institute patent litigation against any entity (including a
          cross-claim or counterclaim in a lawsuit) alleging that the Work
          or a Contribution incorporated within the Work constitutes direct
          or contributory patent infringement, then any patent licenses
          granted to You under this License for that Work shall terminate
          as of the date such litigation is filed.

        4. Redistribution. You may reproduce and distribute copies of the
          Work or Derivative Works thereof in any medium, with or without
          modifications, and in Source or Object form, provided that You
          meet the following conditions:

          (a) You must give any other recipients of the Work or
              Derivative Works a copy of this License; and

          (b) You must cause any modified files to carry prominent notices
              stating that You changed the files; and

          (c) You must retain, in the Source form of any Derivative Works
              that You distribute, all copyright, patent, trademark, and
              attribution notices from the Source form of the Work,
              excluding those notices that do not pertain to any part of
              the Derivative Works; and

          (d) If the Work includes a "NOTICE" text file as part of its
              distribution, then any Derivative Works that You distribute must
              include a readable copy of the attribution notices contained
              within such NOTICE file, excluding those notices that do not
              pertain to any part of the Derivative Works, in at least one
              of the following places: within a NOTICE text file distributed
              as part of the Derivative Works; within the Source form or
              documentation, if provided along with the Derivative Works; or,
              within a display generated by the Derivative Works, if and
              wherever such third-party notices normally appear. The contents
              of the NOTICE file are for informational purposes only and
              do not modify the License. You may add Your own attribution
              notices within Derivative Works that You distribute, alongside
              or as an addendum to the NOTICE text from the Work, provided
              that such additional attribution notices cannot be construed
              as modifying the License.

          You may add Your own copyright statement to Your modifications and
          may provide additional or different license terms and conditions
          for use, reproduction, or distribution of Your modifications, or
          for any such Derivative Works as a whole, provided Your use,
          reproduction, and distribution of the Work otherwise complies with
          the conditions stated in this License.

        5. Submission of Contributions. Unless You explicitly state otherwise,
          any Contribution intentionally submitted for inclusion in the Work
          by You to the Licensor shall be under the terms and conditions of
          this License, without any additional terms or conditions.
          Notwithstanding the above, nothing herein shall supersede or modify
          the terms of any separate license agreement you may have executed
          with Licensor regarding such Contributions.

        6. Trademarks. This License does not grant permission to use the trade
          names, trademarks, service marks, or product names of the Licensor,
          except as required for reasonable and customary use in describing the
          origin of the Work and reproducing the content of the NOTICE file.

        7. Disclaimer of Warranty. Unless required by applicable law or
          agreed to in writing, Licensor provides the Work (and each
          Contributor provides its Contributions) on an "AS IS" BASIS,
          WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
          implied, including, without limitation, any warranties or conditions
          of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
          PARTICULAR PURPOSE. You are solely responsible for determining the
          appropriateness of using or redistributing the Work and assume any
          risks associated with Your exercise of permissions under this License.

        8. Limitation of Liability. In no event and under no legal theory,
          whether in tort (including negligence), contract, or otherwise,
          unless required by applicable law (such as deliberate and grossly
          negligent acts) or agreed to in writing, shall any Contributor be
          liable to You for damages, including any direct, indirect, special,
          incidental, or consequential damages of any character arising as a
          result of this License or out of the use or inability to use the
          Work (including but not limited to damages for loss of goodwill,
          work stoppage, computer failure or malfunction, or any and all
          other commercial damages or losses), even if such Contributor
          has been advised of the possibility of such damages.

        9. Accepting Warranty or Additional Liability. While redistributing
          the Work or Derivative Works thereof, You may choose to offer,
          and charge a fee for, acceptance of support, warranty, indemnity,
          or other liability obligations and/or rights consistent with this
          License. However, in accepting such obligations, You may act only
          on Your own behalf and on Your sole responsibility, not on behalf
          of any other Contributor, and only if You agree to indemnify,
          defend, and hold each Contributor harmless for any liability
          incurred by, or claims asserted against, such Contributor by reason
          of your accepting any such warranty or additional liability.

        END OF TERMS AND CONDITIONS

        APPENDIX: How to apply the Apache License to your work.

          To apply the Apache License to your work, attach the following
          boilerplate notice, with the fields enclosed by brackets "[]"
          replaced with your own identifying information. (Don't include
          the brackets!)  The text should be enclosed in the appropriate
          comment syntax for the file format. We also recommend that a
          file or class name and description of purpose be included on the
          same "printed page" as the copyright notice for easier
          identification within third-party archives.

        Copyright [yyyy] [name of copyright owner]

        Licensed under the Apache License, Version 2.0 (the "License");
        you may not use this file except in compliance with the License.
        You may obtain a copy of the License at

           http://www.apache.org/licenses/LICENSE-2.0

        Unless required by applicable law or agreed to in writing, software
        distributed under the License is distributed on an "AS IS" BASIS,
        WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
        See the License for the specific language governing permissions and
        limitations under the License.


    ---- LLVM Exceptions to the Apache 2.0 License ----

    As an exception, if, as a result of your compiling your source code, portions
    of this Software are embedded into an Object form of such source code, you
    may redistribute such embedded portions in such Object form without complying
    with the conditions of Sections 4(a), 4(b) and 4(d) of the License.

    In addition, if you combine or link compiled forms of this Software with
    software that is licensed under the GPLv2 ("Combined Software") and if a
    court of competent jurisdiction determines that the patent provision (Section
    3), the indemnity provision (Section 9) or other Section of the License
    conflicts with the conditions of the GPLv2, you may retroactively and
    prospectively choose to deem waived or otherwise exclude such Section(s) of
    the License, but only in their entirety and only with respect to the Combined
    Software.

    ==============================================================================
    Software from third parties included in the LLVM Project:
    ==============================================================================
    The LLVM Project contains third party software which is under different license
    terms. All such code will be identified clearly using at least one of two
    mechanisms:
    1) It will be in a separate directory tree with its own `LICENSE.txt` or
       `LICENSE` file at the top containing the specific license and restrictions
       which apply to that software, or
    2) It will contain specific license and restriction terms at the top of every
       file.

    ==============================================================================
    Legacy LLVM License (https://llvm.org/docs/DeveloperPolicy.html#legacy):
    ==============================================================================

    The libunwind library is dual licensed under both the University of Illinois
    "BSD-Like" license and the MIT license.  As a user of this code you may choose
    to use it under either license.  As a contributor, you agree to allow your code
    to be used under both.

    Full text of the relevant licenses is included below.

    ==============================================================================

    University of Illinois/NCSA
    Open Source License

    Copyright (c) 2009-2019 by the contributors listed in CREDITS.TXT

    All rights reserved.

    Developed by:

        LLVM Team

        University of Illinois at Urbana-Champaign

        http://llvm.org

    Permission is hereby granted, free of charge, to any person obtaining a copy of
    this software and associated documentation files (the "Software"), to deal with
    the Software without restriction, including without limitation the rights to
    use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
    of the Software, and to permit persons to whom the Software is furnished to do
    so, subject to the following conditions:

        * Redistributions of source code must retain the above copyright notice,
          this list of conditions and the following disclaimers.

        * Redistributions in binary form must reproduce the above copyright notice,
          this list of conditions and the following disclaimers in the
          documentation and/or other materials provided with the distribution.

        * Neither the names of the LLVM Team, University of Illinois at
          Urbana-Champaign, nor the names of its contributors may be used to
          endorse or promote products derived from this Software without specific
          prior written permission.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
    FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL THE
    CONTRIBUTORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS WITH THE
    SOFTWARE.

    ==============================================================================

    Copyright (c) 2009-2014 by the contributors listed in CREDITS.TXT

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

### dlmalloc (public domain)

The allocator is Emscripten's default, dlmalloc (`libdlmalloc.a`, from
`upstream/emscripten/system/lib/dlmalloc.c`), by Doug Lea. From that file:

    This is a version (aka dlmalloc) of malloc/free/realloc written by
    Doug Lea and released to the public domain, as explained at
    http://creativecommons.org/publicdomain/zero/1.0/ Send questions,
    comments, complaints, performance data, etc to dl@cs.oswego.edu

### What else Emscripten links

The link (`em++ -v` with `build.sh`'s link flags, checked 2026-11-10 against
that emsdk) adds these system libraries and nothing else: `libc` and
`libc_optz` (musl and Emscripten's own C library), `libsockets` (musl's
networking part), `libnoexit` and `libemcc` (Emscripten's own code),
`libc++` and `libc++abi`, `libunwind`, `libclang_rt` (compiler-rt's
builtins) and `libdlmalloc`. Each is covered above. libc++ also compiles
in headers from LLVM's libc (`system/lib/llvm-libc`), under the same LLVM
licence.

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

- `data/text/` (the text metrics Verovio lays text out with:
  `Times.xml`, `Times-bold.xml`, `Times-italic.xml`,
  `Times-bold-italic.xml`) is Verovio's data, embedded unchanged: glyph
  bounding boxes, not a font. Verovio's tree does not record which font
  file they were extracted from: `fonts/generate_text_font.sh` extracts
  them from a font named on its command line, and the files say only
  `font-family="Times"` and `units-per-em="2048"`. Verovio's
  `fonts/README.md` names Liberation as its text font and says "All fonts
  included in Verovio are licensed under the SIL Open Font License"; that
  licence is in `OFL.txt`, which this package ships. Nothing in Verovio's
  tree states a licence for these files beyond that.
- `Leipzig/`, `Leipzig.xml`, `Leipzig.css` and `Bravura.xml` derive from
  the Leipzig and Bravura fonts, under the SIL Open Font License 1.1: see
  `OFL.txt`.
