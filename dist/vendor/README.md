# Vendored libraries

`tabler-1.6.1.min.css` is the CSS distribution from `@tabler/core@1.6.1`.
Source: https://github.com/tabler/tabler/releases/tag/%40tabler%2Fcore%401.6.1
License: MIT, included in `TABLER-LICENSE.txt`.
The source map reference was removed. It is used by the earlier portal
(`../portal.html`); its behavior is in `../app.js` and tokens in `../theme.css`.

`gsap-3.13.0.min.js` and `Flip-3.13.0.min.js` are GSAP 3.13.0 and its Flip plugin,
from https://cdnjs.cloudflare.com/ajax/libs/gsap/3.13.0/ (license headers kept;
terms at https://gsap.com/standard-license). The home page (`../index.html`) uses
them for entrance, panel and list/card animations. They are optional: the page
works without them, and they are skipped when the viewer prefers reduced motion.

No remote scripts, stylesheets, fonts, or third-party services are loaded.
