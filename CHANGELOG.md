# Changelog

## [0.9.0](https://github.com/jimmy-guzman/notras/compare/v0.8.0...v0.9.0) (2026-09-24)


### ⚠ BREAKING CHANGES

* **notes:** 💥 Capture no longer saves to inbox/, and folder:/ matches nothing.

### Features

* **browser:** ✨ add visual note browsing ([#258](https://github.com/jimmy-guzman/notras/issues/258)) ([70a80c4](https://github.com/jimmy-guzman/notras/commit/70a80c41c7af4c7b7d0efcf822a1f876031ed5bf))
* **notes:** ✨ save every new note to one place ([#262](https://github.com/jimmy-guzman/notras/issues/262)) ([6ac9364](https://github.com/jimmy-guzman/notras/commit/6ac93648a4f103139a75c764656652681ba771b7))


### Bug Fixes

* **storage:** 🐛 keep working when saved state fails ([#264](https://github.com/jimmy-guzman/notras/issues/264)) ([507b54e](https://github.com/jimmy-guzman/notras/commit/507b54eeeb9127c68886e8399976ac3ca2126cc3)), closes [#259](https://github.com/jimmy-guzman/notras/issues/259)

## [0.8.0](https://github.com/jimmy-guzman/notras/compare/v0.7.0...v0.8.0) (2026-09-22)


### ⚠ BREAKING CHANGES

* **palette:** 💥 Recent notes and startup now prefer last choice over last save.

### Features

* **palette:** ✨ remember recent notes and commands ([#255](https://github.com/jimmy-guzman/notras/issues/255)) ([1e7c29b](https://github.com/jimmy-guzman/notras/commit/1e7c29baaf376eaab6fe6077c2d30265cc81bd05))


### Bug Fixes

* **editor:** 🐛 tighten link clicks & delay previews ([#256](https://github.com/jimmy-guzman/notras/issues/256)) ([d2398b9](https://github.com/jimmy-guzman/notras/commit/d2398b983de40e835be88157e19f038b00081f6a))

## [0.7.0](https://github.com/jimmy-guzman/notras/compare/v0.6.1...v0.7.0) (2026-09-20)


### ⚠ BREAKING CHANGES

* **tabs:** 💥 ⌘T no longer opens a new note; use ⌘N.

### Features

* ✨ new theme and icon ([#223](https://github.com/jimmy-guzman/notras/issues/223)) ([10c2fbc](https://github.com/jimmy-guzman/notras/commit/10c2fbcd617a0286869388e282465bbfad7c4ae1))
* **tabs:** ✨ keep a new note off disk until typed ([#251](https://github.com/jimmy-guzman/notras/issues/251)) ([dc8ea5f](https://github.com/jimmy-guzman/notras/commit/dc8ea5ffa8d821414e30bfae1b5746c370a3106c))
* **ui:** ✨ pin with ⌘⇧D, find notes from the title bar ([2c1b4c6](https://github.com/jimmy-guzman/notras/commit/2c1b4c665c7bad3c9e126b0d2c4fb6528735afc9))


### Bug Fixes

* **editor:** 🐛 keep long notes responsive while coloring ([#245](https://github.com/jimmy-guzman/notras/issues/245)) ([40c949a](https://github.com/jimmy-guzman/notras/commit/40c949a4dc3cd89f76aa40f2414001ab603fc80b)), closes [#241](https://github.com/jimmy-guzman/notras/issues/241)
* **editor:** 🐛 keep raw html through a save ([#234](https://github.com/jimmy-guzman/notras/issues/234)) ([566c185](https://github.com/jimmy-guzman/notras/commit/566c1851ad722d6bb62daed4d31f5a27d3377f64)), closes [#229](https://github.com/jimmy-guzman/notras/issues/229)
* **editor:** 🐛 keep rich mode responsive on long notes ([#248](https://github.com/jimmy-guzman/notras/issues/248)) ([c1e1fec](https://github.com/jimmy-guzman/notras/commit/c1e1fec202a0344c864c54ffa344a17d2db1acef)), closes [#242](https://github.com/jimmy-guzman/notras/issues/242)
* **editor:** 🐛 keep source mode responsive on long notes ([#243](https://github.com/jimmy-guzman/notras/issues/243)) ([14c8846](https://github.com/jimmy-guzman/notras/commit/14c884675423c51b9c2aaa8e3df8cde0b6b73489)), closes [#240](https://github.com/jimmy-guzman/notras/issues/240)
* **editor:** 🐛 land the caret after shift+enter ([#220](https://github.com/jimmy-guzman/notras/issues/220)) ([c991b56](https://github.com/jimmy-guzman/notras/commit/c991b56219477201a04f7df47d66482df101e70b))
* **editor:** 🐛 open long notes without a stall ([#225](https://github.com/jimmy-guzman/notras/issues/225)) ([33e5dd8](https://github.com/jimmy-guzman/notras/commit/33e5dd81e283bf037936ca68bb340d47400d3d29))
* **editor:** 🐛 parse a long note in linear time ([#236](https://github.com/jimmy-guzman/notras/issues/236)) ([f799476](https://github.com/jimmy-guzman/notras/commit/f79947647d7b15f3eb4370091d12eceb86c61136)), closes [#230](https://github.com/jimmy-guzman/notras/issues/230)
* **editor:** 🐛 stop adjacent tables growing on every save ([#238](https://github.com/jimmy-guzman/notras/issues/238)) ([4bb5217](https://github.com/jimmy-guzman/notras/commit/4bb5217f884c706eeacfdaf6171d316412488a2e)), closes [#231](https://github.com/jimmy-guzman/notras/issues/231)
* **editor:** 🐛 stop converting the caret on every keystroke ([#232](https://github.com/jimmy-guzman/notras/issues/232)) ([e232e0c](https://github.com/jimmy-guzman/notras/commit/e232e0c8119b19f5d367459b6334ed4f22aff3cd)), closes [#227](https://github.com/jimmy-guzman/notras/issues/227)
* **tabs:** 🐛 keep long notes open across tab switches ([#253](https://github.com/jimmy-guzman/notras/issues/253)) ([f61287d](https://github.com/jimmy-guzman/notras/commit/f61287dbd1b68cd9dae43cd0f81f5f89d0d9fe9f)), closes [#250](https://github.com/jimmy-guzman/notras/issues/250)
* **tabs:** 🐛 restore tabs without mounting them all ([#226](https://github.com/jimmy-guzman/notras/issues/226)) ([204a120](https://github.com/jimmy-guzman/notras/commit/204a12099d5ae64597ffd56aea1aa87710c99cc9))
* **ui:** 🐛 drop the save glyph for a failed-save alert ([#222](https://github.com/jimmy-guzman/notras/issues/222)) ([e4e96e8](https://github.com/jimmy-guzman/notras/commit/e4e96e85409a1cfe405be528618c966bdb91b944))
* **ui:** 🐛 highlight code off the ui thread ([#216](https://github.com/jimmy-guzman/notras/issues/216)) ([fbd04a9](https://github.com/jimmy-guzman/notras/commit/fbd04a9156ae2e3a60e017e754cb77a73e5ffa0a)), closes [#196](https://github.com/jimmy-guzman/notras/issues/196)
* **ui:** 🐛 keep the viewport on tab return ([#218](https://github.com/jimmy-guzman/notras/issues/218)) ([4cddbbc](https://github.com/jimmy-guzman/notras/commit/4cddbbc0437c65f545159b8d469e6f5083f47983)), closes [#197](https://github.com/jimmy-guzman/notras/issues/197)
* **ui:** 🐛 let the note fill its frame ([#224](https://github.com/jimmy-guzman/notras/issues/224)) ([2dc10dd](https://github.com/jimmy-guzman/notras/commit/2dc10dd57648bf4d6e4606cb3ac7fe990a1e10fb))
* **ui:** 🐛 ride the scrollbar on the frame's edge ([#221](https://github.com/jimmy-guzman/notras/issues/221)) ([92bcaa7](https://github.com/jimmy-guzman/notras/commit/92bcaa734170a39208750d89e1428315a0cbee7a))


### Refactoring

* **ui:** 🔄 own the shadcn components ([#214](https://github.com/jimmy-guzman/notras/issues/214)) ([fb22eee](https://github.com/jimmy-guzman/notras/commit/fb22eee4fb227d92273e6bb12e2fcfbee2f052fb))

## [0.6.1](https://github.com/jimmy-guzman/notras/compare/v0.6.0...v0.6.1) (2026-09-16)


### Features

* **notes:** ✨ unify note titles and filenames ([#200](https://github.com/jimmy-guzman/notras/issues/200)) ([67ad467](https://github.com/jimmy-guzman/notras/commit/67ad46798c00afb90db2bf0d02decdc4b062ed50))
* **ui:** ✨ adopt compact nova chrome ([#207](https://github.com/jimmy-guzman/notras/issues/207)) ([9e64d70](https://github.com/jimmy-guzman/notras/commit/9e64d70bdaebdda3ed7a69a19c310d4dbdaf09f9))
* **ui:** ✨ case copy by role ([#213](https://github.com/jimmy-guzman/notras/issues/213)) ([f5f270b](https://github.com/jimmy-guzman/notras/commit/f5f270b16151880c7e42ff9ad7d49ca0d304b8ca))
* **ui:** ✨ export a note as a pdf ([#212](https://github.com/jimmy-guzman/notras/issues/212)) ([f22198f](https://github.com/jimmy-guzman/notras/commit/f22198fcf12f0083f091f01352b42e5885669673))
* **ui:** ✨ make chrome controls consistent ([#209](https://github.com/jimmy-guzman/notras/issues/209)) ([4de4ec4](https://github.com/jimmy-guzman/notras/commit/4de4ec4bd6b46074d6e23c9aac276ea6dd79839b))


### Bug Fixes

* **ui:** 🐛 rank pinned notes by exact title & pinned ([#210](https://github.com/jimmy-guzman/notras/issues/210)) ([391a37c](https://github.com/jimmy-guzman/notras/commit/391a37c9712f5c2201f88fe8b3e1b5c8256a745a))


### Performance

* ⚡️ scope tailwind scan & quiet chunk warning  ([#206](https://github.com/jimmy-guzman/notras/issues/206)) ([c6aacee](https://github.com/jimmy-guzman/notras/commit/c6aacee3474600a3df6eaa6a3a04e92ec05767b4))


### Refactoring

* 🔄 adopt react compiler ([#205](https://github.com/jimmy-guzman/notras/issues/205)) ([ed10083](https://github.com/jimmy-guzman/notras/commit/ed10083412ec6daed8f235198f5a088da8c2b9d3))
* 🔄 migrate to oxc ([#204](https://github.com/jimmy-guzman/notras/issues/204)) ([a25fab9](https://github.com/jimmy-guzman/notras/commit/a25fab9d1426e8938ca379f431abf8bcf225d92f))
* 🔄 simpler palette ([37840d0](https://github.com/jimmy-guzman/notras/commit/37840d0ea2262dc2159a19ba6d1410c6cb9950c0))
* **app:** 🔄 drop tanstack router ([#202](https://github.com/jimmy-guzman/notras/issues/202)) ([f9a0b47](https://github.com/jimmy-guzman/notras/commit/f9a0b47b62f5674f2f54a9757ec29d7fd4362cd6))
* **ui:** 🔄 drop the middot & reading time ([#208](https://github.com/jimmy-guzman/notras/issues/208)) ([4412b3d](https://github.com/jimmy-guzman/notras/commit/4412b3d2003f8239de258e9baf6caa5ccab20887))

## [0.6.0](https://github.com/jimmy-guzman/notras/compare/v0.5.0...v0.6.0) (2026-09-14)


### ⚠ BREAKING CHANGES

* 💥 macos 25 and older can no longer run notras

### Features

* ✨ keep note operations responsive during indexing ([#184](https://github.com/jimmy-guzman/notras/issues/184)) ([a8ce10b](https://github.com/jimmy-guzman/notras/commit/a8ce10bdfc077ee7b6ba6b0d7da592f3b14a6a7a)), closes [#180](https://github.com/jimmy-guzman/notras/issues/180)
* ✨ preserve external edits that overlap unsaved ([#186](https://github.com/jimmy-guzman/notras/issues/186)) ([54a1795](https://github.com/jimmy-guzman/notras/commit/54a1795a7ece9ee60783058a87e649208fce9a06)), closes [#177](https://github.com/jimmy-guzman/notras/issues/177)
* ✨ require macos 26 ([#191](https://github.com/jimmy-guzman/notras/issues/191)) ([981a66c](https://github.com/jimmy-guzman/notras/commit/981a66c149ea2a100df6c66822d0836c7f51d4af))
* ✨ resolve relative destinations against the file ([#189](https://github.com/jimmy-guzman/notras/issues/189)) ([06daaff](https://github.com/jimmy-guzman/notras/commit/06daaff24ab55b36226d5c141787b3eefe8aac80))
* **tabs:** ✨ shape tabs as chrome items ([#188](https://github.com/jimmy-guzman/notras/issues/188)) ([22f5ae2](https://github.com/jimmy-guzman/notras/commit/22f5ae2ad412a72b6e2cb7fde14bd3933e98ae79))
* **titlebar:** ✨ drag the window from any unused space ([#193](https://github.com/jimmy-guzman/notras/issues/193)) ([0188de5](https://github.com/jimmy-guzman/notras/commit/0188de5daac60003dfa9f4735ff8e9a150d168b1))


### Bug Fixes

* 🐛 bind library io to validated folders ([#185](https://github.com/jimmy-guzman/notras/issues/185)) ([eda61fb](https://github.com/jimmy-guzman/notras/commit/eda61fbad9e8824875247900c3451778be5f2e2b)), closes [#178](https://github.com/jimmy-guzman/notras/issues/178)
* 🐛 index writes that land while a folder switch prepares ([#187](https://github.com/jimmy-guzman/notras/issues/187)) ([9beb4f7](https://github.com/jimmy-guzman/notras/commit/9beb4f71b43752531d6a2f904ef2289f8461d57e)), closes [#183](https://github.com/jimmy-guzman/notras/issues/183)
* **editor:** 🐛 lift the dim under a cross-block selection ([#190](https://github.com/jimmy-guzman/notras/issues/190)) ([a9d12b7](https://github.com/jimmy-guzman/notras/commit/a9d12b758283ddd9cbbba8e241f2ad3213462701)), closes [#167](https://github.com/jimmy-guzman/notras/issues/167)
* **editor:** 🐛 open an existing note at its top ([#192](https://github.com/jimmy-guzman/notras/issues/192)) ([cb539b3](https://github.com/jimmy-guzman/notras/commit/cb539b3f04d00b271008efc07687aaa4233590f7))


### Refactoring

* 🔄 move the note backend into rust ([#179](https://github.com/jimmy-guzman/notras/issues/179)) ([a7be505](https://github.com/jimmy-guzman/notras/commit/a7be505710beed691486f19f31f839dff1359e4b))

## [0.5.0](https://github.com/jimmy-guzman/notras/compare/v0.4.0...v0.5.0) (2026-09-10)


### ⚠ BREAKING CHANGES

* 💥 graph view shortcut is now `cmd+alt+g`

### Features

* ✨ add palette filters and note find ([#174](https://github.com/jimmy-guzman/notras/issues/174)) ([e332858](https://github.com/jimmy-guzman/notras/commit/e3328582d7dd8263ffdc2aeec1dccf21d9857620))


### Bug Fixes

* 🐛 eliminate duplicate scrollbars & scroll stutter ([#163](https://github.com/jimmy-guzman/notras/issues/163)) ([ef32871](https://github.com/jimmy-guzman/notras/commit/ef32871bfcbae944320fd9f013da2ba42d255208))

## [0.4.0](https://github.com/jimmy-guzman/notras/compare/v0.3.1...v0.4.0) (2026-09-09)


### ⚠ BREAKING CHANGES

* 💥 typewriter mode is now part of focus mode

### Features

* ✨ code blocks preserve language metadata ([#161](https://github.com/jimmy-guzman/notras/issues/161)) ([36f6a11](https://github.com/jimmy-guzman/notras/commit/36f6a11bd5e760fc33043ac33e9abf37e3ece641))
* ✨ fold typewriter scrolling into focus mode ([#162](https://github.com/jimmy-guzman/notras/issues/162)) ([f8a8fa9](https://github.com/jimmy-guzman/notras/commit/f8a8fa9fdaf474115a1629936a0a0d7e0d86b649))
* ✨ refresh theme, logo, and syntax ([#160](https://github.com/jimmy-guzman/notras/issues/160)) ([12a34be](https://github.com/jimmy-guzman/notras/commit/12a34be806673df94fe362783a7b1153b2546b8c))


### Bug Fixes

* 🐛 prevent elastic scrolling on window ([#158](https://github.com/jimmy-guzman/notras/issues/158)) ([5ccaa8d](https://github.com/jimmy-guzman/notras/commit/5ccaa8dd6e6133b69b109b98c124d63eac147b87))

## [0.3.1](https://github.com/jimmy-guzman/notras/compare/v0.3.0...v0.3.1) (2026-09-08)


### Features

* ✨ add drag and drop blocks or selections ([#139](https://github.com/jimmy-guzman/notras/issues/139)) ([d5e8c9d](https://github.com/jimmy-guzman/notras/commit/d5e8c9d36f603c9533bef1842fae924d9c984581))
* ✨ add graph hubs ([#154](https://github.com/jimmy-guzman/notras/issues/154)) ([51ad113](https://github.com/jimmy-guzman/notras/commit/51ad1132bf65e0c6cfb35f0f4969c2669ec753fa))
* ✨ add graph view ([#153](https://github.com/jimmy-guzman/notras/issues/153)) ([61a611a](https://github.com/jimmy-guzman/notras/commit/61a611a1246519836facf2e4f4bb07a7b877b8a1))
* ✨ add mentions (backlinks) ([#151](https://github.com/jimmy-guzman/notras/issues/151)) ([ff068ea](https://github.com/jimmy-guzman/notras/commit/ff068eaca673bb9936e2c26c2cccf997ff11b347))
* ✨ count a bare title as a mention ([#152](https://github.com/jimmy-guzman/notras/issues/152)) ([0d0dc2c](https://github.com/jimmy-guzman/notras/commit/0d0dc2c25838196dfed2be6362c1b57fb83f753f))
* ✨ more consistent editor presentation ([#156](https://github.com/jimmy-guzman/notras/issues/156)) ([0d43d19](https://github.com/jimmy-guzman/notras/commit/0d43d197bceee6b28c1a719ac1a2b0c809c62748))
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
