# Changelog

## [0.3.1](https://github.com/jimmy-guzman/notras/compare/v0.3.0...v0.3.1) (2026-09-06)


### Features

* ✨ add drag and drop blocks or selections ([#139](https://github.com/jimmy-guzman/notras/issues/139)) ([d5e8c9d](https://github.com/jimmy-guzman/notras/commit/d5e8c9d36f603c9533bef1842fae924d9c984581))
* ✨ add graph hubs ([#154](https://github.com/jimmy-guzman/notras/issues/154)) ([51ad113](https://github.com/jimmy-guzman/notras/commit/51ad1132bf65e0c6cfb35f0f4969c2669ec753fa))
* ✨ add graph view ([#153](https://github.com/jimmy-guzman/notras/issues/153)) ([61a611a](https://github.com/jimmy-guzman/notras/commit/61a611a1246519836facf2e4f4bb07a7b877b8a1))
* ✨ add mentions (backlinks) ([#151](https://github.com/jimmy-guzman/notras/issues/151)) ([ff068ea](https://github.com/jimmy-guzman/notras/commit/ff068eaca673bb9936e2c26c2cccf997ff11b347))
* ✨ count a bare title as a mention ([#152](https://github.com/jimmy-guzman/notras/issues/152)) ([0d0dc2c](https://github.com/jimmy-guzman/notras/commit/0d0dc2c25838196dfed2be6362c1b57fb83f753f))
* ✨ new app tagline ([#148](https://github.com/jimmy-guzman/notras/issues/148)) ([deb94f9](https://github.com/jimmy-guzman/notras/commit/deb94f9cd176a477e50dc323a231c92d5edd755f))
* ✨ reach every tab action from the keyboard  ([#149](https://github.com/jimmy-guzman/notras/issues/149)) ([6484fe5](https://github.com/jimmy-guzman/notras/commit/6484fe572c9908ccb840519ecc57b8412f06f878))


### Bug Fixes

* 🐛  index markdown files whatever the extension case ([#144](https://github.com/jimmy-guzman/notras/issues/144)) ([2a81b97](https://github.com/jimmy-guzman/notras/commit/2a81b97f2a18c736b2668f3bbe3ae125808d5845)), closes [#114](https://github.com/jimmy-guzman/notras/issues/114)
* 🐛 bump deps ([8fcbf9e](https://github.com/jimmy-guzman/notras/commit/8fcbf9edf230a83b5d14b3175211b0fa03550d4a))
* 🐛 copy path is full path ([#150](https://github.com/jimmy-guzman/notras/issues/150)) ([3738979](https://github.com/jimmy-guzman/notras/commit/3738979472df5b7d2e8ce8490a94342b2c925a40))
* 🐛 enforce the 120 cap on filenames ([#142](https://github.com/jimmy-guzman/notras/issues/142)) ([43631b7](https://github.com/jimmy-guzman/notras/commit/43631b7705f66906770ce79ddfc18c0e939c0af9)), closes [#117](https://github.com/jimmy-guzman/notras/issues/117)
* 🐛 focus affordance on hand written controls ([#147](https://github.com/jimmy-guzman/notras/issues/147)) ([39f8bd2](https://github.com/jimmy-guzman/notras/commit/39f8bd29365dc2a95a75b758e9165864d9fb228a))
* 🐛 make every error say what failed and why ([#146](https://github.com/jimmy-guzman/notras/issues/146)) ([f0e1974](https://github.com/jimmy-guzman/notras/commit/f0e19748226b26abe61b6049ebe289d83bb69f5b))
* 🐛 open with inside the vault opens a note ([#143](https://github.com/jimmy-guzman/notras/issues/143)) ([4787cc5](https://github.com/jimmy-guzman/notras/commit/4787cc5c874fa2d67b398550db4ef6defb7f7b91))
* 🐛 resolve symlinks before classifying open with ([#145](https://github.com/jimmy-guzman/notras/issues/145)) ([ec40684](https://github.com/jimmy-guzman/notras/commit/ec40684444d5efa2edd332fb76dec763de04a815))

## [0.3.0](https://github.com/jimmy-guzman/notras/compare/v0.2.2...v0.3.0) (2026-09-01)


### ⚠ BREAKING CHANGES

* 💥 palette is now cmd+p & shift+cmd+p, raw mode is now cmd+e

### Features

* ✨ add keys to command palette ([#135](https://github.com/jimmy-guzman/notras/issues/135)) ([24a93af](https://github.com/jimmy-guzman/notras/commit/24a93af4de2aa5fa6ed66b209887766566de965f))
* ✨ split palette find and actions ([#136](https://github.com/jimmy-guzman/notras/issues/136)) ([5e7b86e](https://github.com/jimmy-guzman/notras/commit/5e7b86e9c2a95951a939752764dd5552a010824c))


### Bug Fixes

* 🐛 strikethrough does not escape ([#137](https://github.com/jimmy-guzman/notras/issues/137)) ([ecefaf8](https://github.com/jimmy-guzman/notras/commit/ecefaf858144fe294166afbd3271dcf4cfcec5ee))


### Refactoring

* 🔄 use tanstack hotkeys ([#130](https://github.com/jimmy-guzman/notras/issues/130)) ([6c957a9](https://github.com/jimmy-guzman/notras/commit/6c957a9def539499a3c567eb33ba745f266d8da1))
* 🔄 use tanstack pacer for debounce ([#129](https://github.com/jimmy-guzman/notras/issues/129)) ([f6736e5](https://github.com/jimmy-guzman/notras/commit/f6736e5421b4403fcef7d6cdeec71fa9eddadc98))
* 🔄 use tanstack query for reads & writes ([#127](https://github.com/jimmy-guzman/notras/issues/127)) ([1e88fab](https://github.com/jimmy-guzman/notras/commit/1e88fab6c2dc0faf77222529588567e747be8521))
* 🔄 use tanstack store ([#133](https://github.com/jimmy-guzman/notras/issues/133)) ([5626377](https://github.com/jimmy-guzman/notras/commit/5626377cbd176b8fb5b1c68c10e2897b3c08cdcd))

## [0.2.2](https://github.com/jimmy-guzman/notras/compare/v0.2.1...v0.2.2) (2026-08-31)


### Bug Fixes

* 🐛 align tauri js packages with their crates ([#125](https://github.com/jimmy-guzman/notras/issues/125)) ([41c8dd0](https://github.com/jimmy-guzman/notras/commit/41c8dd0d4e905e248cab0c8d806c6ecaac1c8447))

## [0.2.1](https://github.com/jimmy-guzman/notras/compare/v0.2.0...v0.2.1) (2026-08-31)


### Features

* ✨ single tab now drags window ([#112](https://github.com/jimmy-guzman/notras/issues/112)) ([37265ed](https://github.com/jimmy-guzman/notras/commit/37265ed837848fea88286f16c476a7e43181b548))


### Bug Fixes

* 🐛 bump deps ([#123](https://github.com/jimmy-guzman/notras/issues/123)) ([4494f17](https://github.com/jimmy-guzman/notras/commit/4494f17bc8b37eaca2d6e417f44a4c794143e9cf))
* 🐛 no save icon on no active notes ([#121](https://github.com/jimmy-guzman/notras/issues/121)) ([093c799](https://github.com/jimmy-guzman/notras/commit/093c7998c01b64dd98741bbef20284c14fc5f789))
* 🐛 no tabs allows for dragging window ([#124](https://github.com/jimmy-guzman/notras/issues/124)) ([5067a07](https://github.com/jimmy-guzman/notras/commit/5067a07a2a9949d364d52ebc44680ccd8ca8c0c9))


### Refactoring

* 🔄 smoother typewriter experience ([#122](https://github.com/jimmy-guzman/notras/issues/122)) ([f10c1e9](https://github.com/jimmy-guzman/notras/commit/f10c1e9ec8a9576b2c8d97624f3823d9e7a874a8))

## [0.2.0](https://github.com/jimmy-guzman/notras/compare/v0.1.2...v0.2.0) (2026-08-26)


### ⚠ BREAKING CHANGES

* 💥 tags key is now "cmd+shift+y" instead of "cmd+shift+t"

### Features

* ✨ add syntax highlighting for Markdown frontmatter ([#110](https://github.com/jimmy-guzman/notras/issues/110)) ([2ae897d](https://github.com/jimmy-guzman/notras/commit/2ae897d26429115f86c63be9058a326f6745c64b))
* ✨ compact title bar ([#103](https://github.com/jimmy-guzman/notras/issues/103)) ([a2b1656](https://github.com/jimmy-guzman/notras/commit/a2b16561e6755fdac8630873bcccb4405038f131))
* ✨ make draggable tabs feel alive ([#111](https://github.com/jimmy-guzman/notras/issues/111)) ([c55baa4](https://github.com/jimmy-guzman/notras/commit/c55baa4d075e3dd607ef0fb810517868aed9ee72))
* ✨ tabs are live ([#106](https://github.com/jimmy-guzman/notras/issues/106)) ([efc3bc4](https://github.com/jimmy-guzman/notras/commit/efc3bc4d44ee4033e3439a713867aa6fadd72b6a))


### Bug Fixes

* 🐛 close nested list and code block gaps ([#105](https://github.com/jimmy-guzman/notras/issues/105)) ([1c276bb](https://github.com/jimmy-guzman/notras/commit/1c276bb2f07bba025457c5d45827dcb223dbea8c))
* 🐛 let the editor hold what markdown expresses ([#109](https://github.com/jimmy-guzman/notras/issues/109)) ([880b444](https://github.com/jimmy-guzman/notras/commit/880b4446ffe89f72daf1c8954382aa3756d413c5))
* 🐛 prevent elastic scrolling on window ([#108](https://github.com/jimmy-guzman/notras/issues/108)) ([45733ce](https://github.com/jimmy-guzman/notras/commit/45733ce03a18c1718fc8145ee5aff5a5a176c271))


### Refactoring

* 🔄 migrate to baseui's toast ([#107](https://github.com/jimmy-guzman/notras/issues/107)) ([ec543ea](https://github.com/jimmy-guzman/notras/commit/ec543ea093f458037e0e5d46849cc61f5b02223b))

## [0.1.2](https://github.com/jimmy-guzman/notras/compare/v0.1.1...v0.1.2) (2026-08-22)


### Bug Fixes

* **tauri:** 🐛 gate the reopen arm to macos ([#99](https://github.com/jimmy-guzman/notras/issues/99)) ([9c603a1](https://github.com/jimmy-guzman/notras/commit/9c603a1023c7cfa23322af2e75baecfcdbd7e21e))

## [0.1.1](https://github.com/jimmy-guzman/notras/compare/v0.1.0...v0.1.1) (2026-08-21)


### Features

* ✨ in-app updates ([#97](https://github.com/jimmy-guzman/notras/issues/97)) ([8ad6caa](https://github.com/jimmy-guzman/notras/commit/8ad6caa3ed9fce77fad26cc6126be8d82ee7d4d9))
