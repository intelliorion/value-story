# Third-Party Notices

This project's build step (`scripts/generate-validators.mjs`) inlines two small
runtime helper functions, verbatim, into the committed, redistributed file
`generated/validate-value-case.mjs`, so that file can run with no `node_modules`
at all. Both source packages are MIT-licensed. Per the MIT license, their
copyright and permission notices are reproduced below and must be retained in
copies or substantial portions of the software.

Neither package is a runtime dependency of this project (see `package.json`
`dependencies: {}`); `ajv` is a `devDependency` used only at build time, and
`fast-deep-equal` is a transitive dependency of `ajv`. Only two small functions
from these packages' source are copied into `generated/validate-value-case.mjs`.

---

## ajv

- Inlined function: `ucs2length` (unicode-aware string length, used for
  `minLength`/`maxLength` validation)
- Package: `ajv`
- Version used: `8.20.0`
- Source file: `node_modules/ajv/dist/runtime/ucs2length.js`
- License: MIT (from `node_modules/ajv/LICENSE`)

```
The MIT License (MIT)

Copyright (c) 2015-2021 Evgeny Poberezkin

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## fast-deep-equal

- Inlined function: `equal` (deep equality, used for `enum`/`const`/`uniqueItems`
  validation — this is the implementation `ajv/dist/runtime/equal.js` re-exports)
- Package: `fast-deep-equal`
- Version used: `3.1.3`
- Source file: `node_modules/fast-deep-equal/index.js`
- License: MIT (from `node_modules/fast-deep-equal/LICENSE`)

```
MIT License

Copyright (c) 2017 Evgeny Poberezkin

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
