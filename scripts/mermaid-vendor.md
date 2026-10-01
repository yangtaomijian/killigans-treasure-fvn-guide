# Mermaid runtime provenance

`assets/vendor/mermaid.min.js` is the Mermaid bundle supplied by the installed Quarto distribution (`share/formats/html/mermaid/mermaid.min.js`). Its embedded package metadata identifies Mermaid 11.12.0, author Knut Sveidqvist, MIT license. Embedded dependency license notices are retained. This is a code dependency; no game media is included. The bundle is local so diagram rendering does not depend on a CDN.

`kt-story-map.js` extracts DW's Story Map viewBox, zoom, pointer/wheel/keyboard and modal behavior only. It excludes Memories, Sprite Viewer, tab/pagination and DW-specific story overview assumptions. KT adds multiple independent viewers, delayed single-touch capture for linked taps, safe handling of cancelled capture, actual-content pan bounds for small diagrams, cross-page guide links, and its own visual tokens.

The local bundle normalizes whitespace using equivalent untagged-template escapes while retaining dependency license notices. Upstream SHA-256: `07e37dfa97b337ccc85365d57eddf99b9706f09db3b59b260d0333b23b343c4b`; local SHA-256: `c5a334b4b100ed868c561035a8e52622a9dffcde0113606bb3b2e3316f8d57a8`.
