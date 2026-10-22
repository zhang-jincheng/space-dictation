# Attribution and modifications

空格听写 (Space Dictation), version 1.2.1.

This application is derived from [MintWord / 薄荷词汇](https://github.com/Yunease/MintWord), by Yunease and MintWord contributors, at upstream commit `16ef1b18a030bcd00954bc5414b01cc3c969e3f1`. Original copyright notices and source modules are retained. MintWord declares AGPL-3.0 in its README and Cargo metadata; this derivative is distributed under AGPL-3.0, with the full license in LICENSE.

Modifications include an independent application identity and data directory; a Chinese paper-dictation interface; manual Space/R controls; cancellable recording preparation; cross-platform local audio validation and playback; custom-list preview and editing; local session state; review-page playback; wrong-word practice; transactional JSON backup and restore; and a ChatGPT import prompt with a local inbox.

The CET4, CET6 and IELTS CSV dictionaries are retained from MintWord. MintWord identifies ECDICT as the English dictionary source. ECDICT is by skywind3000 and contributors, licensed under MIT; the upstream license is included in ECDICT-LICENSE.txt. Dictionary data is embedded in the app for offline use. No ownership of the original project or dictionaries is claimed.

The application downloads existing dictionary recordings at runtime and does not bundle those online recordings in the source or installer. It attempts Google Dictionary and NetEase Youdao Dictionary before Wikimedia Commons. Google and Youdao recordings are identified in the interface as public dictionary recordings for personal learning and remain subject to their respective service terms. Wikimedia candidates are restricted to MP3 derivatives whose metadata reports CC BY, CC BY-SA, CC0, or public-domain licensing; the matching author, source page, license, and download URL are saved beside the local file.

The source test fixtures include apple and opportunity recordings by Dvortygirl, licensed CC BY-SA 3.0 (https://creativecommons.org/licenses/by-sa/3.0/), and hello by Dvortygirl, public domain. These are unchanged Wikimedia MP3 derivatives; the original author pages, URLs, licenses and hashes are in tests/fixtures/recordings/*.json. See https://commons.wikimedia.org/wiki/File:En-us-apple.ogg, https://commons.wikimedia.org/wiki/File:En-us-opportunity.ogg and https://commons.wikimedia.org/wiki/File:En-us-hello.ogg. Audio licenses apply separately from the application source license.

