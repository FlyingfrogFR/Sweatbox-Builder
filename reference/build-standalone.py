#!/usr/bin/env python3
"""Bundle plugins into a standalone HTML for distribution.

Reads plugins.json, inlines each listed plugin as a
<script type="text/plain" data-plugin="..."> block in the source HTML,
writes the result to sweatbox-builder-v6-standalone.html.

The output works when opened directly via file:// (no server needed)
and is suitable for zipping and sending to other users.

Usage:
    python3 build-standalone.py
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).parent
SRC_HTML = ROOT / 'sweatbox-builder-v6.html'
DST_HTML = ROOT / 'sweatbox-builder-v6-standalone.html'
MANIFEST = ROOT / 'plugins.json'

def main():
    if not SRC_HTML.exists():
        sys.exit(f'Missing: {SRC_HTML}')
    if not MANIFEST.exists():
        sys.exit(f'Missing: {MANIFEST}')

    manifest = json.loads(MANIFEST.read_text(encoding='utf-8'))
    plugins = manifest['plugins'] if isinstance(manifest, dict) else manifest

    blocks = []
    for fname in plugins:
        path = ROOT / fname
        if not path.exists():
            sys.exit(f'Missing plugin file: {path}')
        code = path.read_text(encoding='utf-8')
        # Defensive escape: prevent a stray </script> in plugin source
        # from terminating the wrapping <script> block.
        code_safe = code.replace('</script>', r'<\/script>')
        blocks.append(
            f'<script type="text/plain" data-plugin="{fname}">\n'
            f'{code_safe}\n'
            f'</script>'
        )

    src = SRC_HTML.read_text(encoding='utf-8')
    marker = '<!-- Main shell -->'
    if marker not in src:
        sys.exit(f'Could not find marker {marker!r} in {SRC_HTML.name}. '
                 'The script expects an unmodified shell.')

    inlined = '\n'.join(blocks) + '\n\n'
    out = src.replace(marker, inlined + marker, 1)
    DST_HTML.write_text(out, encoding='utf-8')
    print(f'Wrote {DST_HTML.name} ({len(plugins)} plugins inlined).')
    print('Open directly in a browser (no server needed) or zip & distribute.')

if __name__ == '__main__':
    main()