#!/usr/bin/env python3
"""Build Scrapforge-3D.html: the 3D explorer as ONE self-contained file.

Phones and tablets often can't load a page's neighbouring .css/.js files when an
.html file is opened straight from the Downloads folder, so everything (styles,
game scripts and the Three.js library) is inlined here. Run after changing the game:

    python3 tools/build_standalone.py
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'explorer'
OUT = ROOT / 'Scrapforge-3D.html'

html = (SRC / 'index.html').read_text()
head_end = html.index('</head>')
head = html[:head_end]
body = html[html.index('<body>') + 6:html.index('</body>')]

scripts = re.findall(r'<script src="([^"]+)"></script>', body)
body = re.sub(r'<script src="[^"]+"></script>\n?', '', body)
body = re.sub(r'\s*<a class="menu-link"[^>]*>.*?</a>', '', body)  # the 2D game isn't part of this file

# drop links to files that won't sit next to the standalone page
head = re.sub(r'<link rel="(manifest|stylesheet)" href="(manifest\.webmanifest|style\.css)">\n?', '', head)
head = head.replace('<link rel="icon" href="icon.svg" type="image/svg+xml">',
                    '<link rel="icon" href="data:image/svg+xml,' +
                    (SRC / 'icon.svg').read_text().strip().replace('#', '%23').replace('"', "'") + '">')

css = (SRC / 'style.css').read_text()
parts = [head, '<style>\n' + css + '\n</style>\n</head>\n<body>', body]
for s in scripts:
    code = (SRC / s).read_text()
    code = code.replace('</script', '<\\/script')
    parts.append('<script>\n' + code + '\n</script>')
parts.append('</body>\n</html>\n')
OUT.write_text('\n'.join(parts))
print(f'wrote {OUT.name} ({OUT.stat().st_size // 1024} KB, {len(scripts)} scripts inlined)')
