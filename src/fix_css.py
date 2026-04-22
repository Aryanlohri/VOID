import re
import sys

def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Replacements
    replacements = [
        # Hex backgrounds
        (r'background:\s*#0f0f0f;', r'background: var(--bg);'),
        (r'background:\s*#111111;', r'background: var(--bg2);'),
        (r'background:\s*#141414;', r'background: var(--surface);'),
        
        # Solid Hex Colors mapping
        (r'color:\s*#00c882;', r'color: var(--green);'),
        (r'background:\s*#00c882;', r'background: var(--green);'),
        (r'background:\s*#e8a838;', r'background: var(--warn);'),
        
        # Text and Borders with rgba(255, 255, 255, ...)
        (r'rgba\(255,255,255,0\.02\)', r'var(--surface2)'),
        (r'rgba\(255,255,255,0\.03\)', r'var(--surface2)'),
        (r'rgba\(255,255,255,0\.04\)', r'var(--border)'),
        (r'rgba\(255,255,255,0\.05\)', r'var(--border)'),
        (r'rgba\(255,255,255,0\.06\)', r'var(--border)'),
        (r'rgba\(255,255,255,0\.07\)', r'var(--border)'),
        (r'rgba\(255,255,255,0\.08\)', r'var(--border)'),
        (r'rgba\(255,255,255,0\.12\)', r'var(--border-hi)'),
        (r'rgba\(255,255,255,0\.15\)', r'var(--text-muted)'),
        (r'rgba\(255,255,255,0\.18\)', r'var(--text-muted)'),
        (r'rgba\(255,255,255,0\.2\)', r'var(--text-dim)'),
        (r'rgba\(255,255,255,0\.25\)', r'var(--text-dim)'),
        (r'rgba\(255,255,255,0\.3\)', r'var(--text-dim)'),
        (r'rgba\(255,255,255,0\.35\)', r'var(--text-dim)'),
        (r'rgba\(255,255,255,0\.55\)', r'var(--text)'),
        (r'rgba\(255,255,255,0\.6\)', r'var(--text)'),
        (r'rgba\(255,255,255,0\.65\)', r'var(--text)'),
        
        # Transparent backgrounds with rgba(0,0,0, ...)
        (r'rgba\(0,0,0,0\.1\)', r'var(--bg3)'),
        (r'rgba\(0,0,0,0\.12\)', r'var(--bg4)'),
        (r'rgba\(0,0,0,0\.2\)', r'var(--bg2)'),

        # Accent colors with alpha
        # green
        (r'rgba\(0,200,130,0\.1\)', r'color-mix(in srgb, var(--green) 10%, transparent)'),
        (r'rgba\(0,200,130,0\.3\)', r'color-mix(in srgb, var(--green) 30%, transparent)'),
        (r'rgba\(0,200,130,0\.4\)', r'color-mix(in srgb, var(--green) 40%, transparent)'),
        (r'rgba\(0,200,130,0\.06\)', r'color-mix(in srgb, var(--green) 6%, transparent)'),
        (r'rgba\(0,200,130,0\.07\)', r'color-mix(in srgb, var(--green) 7%, transparent)'),
        # red
        (r'rgba\(255,120,100,0\.7\)', r'color-mix(in srgb, var(--red) 70%, transparent)'),
        (r'rgba\(255,120,100,0\.2\)', r'color-mix(in srgb, var(--red) 20%, transparent)'),
        (r'rgba\(230,80,80,0\.07\)', r'color-mix(in srgb, var(--red) 7%, transparent)'),
        (r'rgba\(230,80,80,0\.6\)', r'color-mix(in srgb, var(--red) 60%, transparent)'),
        (r'rgba\(232,80,80,0\.06\)', r'color-mix(in srgb, var(--red) 6%, transparent)'),
        (r'rgba\(232,80,80,0\.3\)', r'color-mix(in srgb, var(--red) 30%, transparent)'),
        # accent-rose
        (r'rgba\(212,123,138,0\.04\)', r'color-mix(in srgb, var(--accent-rose) 4%, transparent)'),
        (r'rgba\(212,123,138,0\.06\)', r'color-mix(in srgb, var(--accent-rose) 6%, transparent)'),
        (r'rgba\(212,123,138,0\.08\)', r'color-mix(in srgb, var(--accent-rose) 8%, transparent)'),
        (r'rgba\(212,123,138,0\.1\)', r'color-mix(in srgb, var(--accent-rose) 10%, transparent)'),
        (r'rgba\(212,123,138,0\.15\)', r'color-mix(in srgb, var(--accent-rose) 15%, transparent)'),
        (r'rgba\(212,123,138,0\.18\)', r'color-mix(in srgb, var(--accent-rose) 18%, transparent)'),
        (r'rgba\(212,123,138,0\.2\)', r'color-mix(in srgb, var(--accent-rose) 20%, transparent)'),
        (r'rgba\(212,123,138,0\.25\)', r'color-mix(in srgb, var(--accent-rose) 25%, transparent)'),
        (r'rgba\(212,123,138,0\.3\)', r'color-mix(in srgb, var(--accent-rose) 30%, transparent)'),
        (r'rgba\(212,123,138,1\)', r'var(--accent-rose)'),
        # accent-warm
        (r'rgba\(212,165,116,0\.04\)', r'color-mix(in srgb, var(--accent-warm) 4%, transparent)'),
        (r'rgba\(212,165,116,0\.06\)', r'color-mix(in srgb, var(--accent-warm) 6%, transparent)'),
        (r'rgba\(212,165,116,0\.08\)', r'color-mix(in srgb, var(--accent-warm) 8%, transparent)'),
        (r'rgba\(212,165,116,0\.1\)', r'color-mix(in srgb, var(--accent-warm) 10%, transparent)'),
        (r'rgba\(212,165,116,0\.15\)', r'color-mix(in srgb, var(--accent-warm) 15%, transparent)'),
        (r'rgba\(212,165,116,0\.2\)', r'color-mix(in srgb, var(--accent-warm) 20%, transparent)'),
        (r'rgba\(212,165,116,0\.25\)', r'color-mix(in srgb, var(--accent-warm) 25%, transparent)'),
        (r'rgba\(212,165,116,0\.3\)', r'color-mix(in srgb, var(--accent-warm) 30%, transparent)'),
        (r'rgba\(212,165,116,0\.9\)', r'color-mix(in srgb, var(--accent-warm) 90%, transparent)'),
        # accent-cool
        (r'rgba\(126,184,218,0\.06\)', r'color-mix(in srgb, var(--accent-cool) 6%, transparent)'),
        (r'rgba\(126,184,218,0\.15\)', r'color-mix(in srgb, var(--accent-cool) 15%, transparent)'),
        (r'rgba\(126,184,218,0\.2\)', r'color-mix(in srgb, var(--accent-cool) 20%, transparent)'),
        (r'rgba\(126,184,218,0\.3\)', r'color-mix(in srgb, var(--accent-cool) 30%, transparent)'),
        (r'rgba\(126,184,218,0\.35\)', r'color-mix(in srgb, var(--accent-cool) 35%, transparent)'),
        # accent-mint
        (r'rgba\(126,201,164,0\.05\)', r'color-mix(in srgb, var(--accent-mint) 5%, transparent)'),
        (r'rgba\(126,201,164,0\.15\)', r'color-mix(in srgb, var(--accent-mint) 15%, transparent)'),
        (r'rgba\(126,201,164,0\.2\)', r'color-mix(in srgb, var(--accent-mint) 20%, transparent)'),
        # accent-lilac
        (r'rgba\(176,156,216,0\.06\)', r'color-mix(in srgb, var(--accent-lilac) 6%, transparent)'),
        (r'rgba\(176,156,216,0\.1\)', r'color-mix(in srgb, var(--accent-lilac) 10%, transparent)'),
        (r'rgba\(176,156,216,0\.2\)', r'color-mix(in srgb, var(--accent-lilac) 20%, transparent)'),
        (r'rgba\(176,156,216,0\.3\)', r'color-mix(in srgb, var(--accent-lilac) 30%, transparent)'),
        # warn (e8a838)
        (r'rgba\(232,168,56,0\.3\)', r'color-mix(in srgb, var(--warn) 30%, transparent)'),
        (r'rgba\(232,168,56,0\.06\)', r'color-mix(in srgb, var(--warn) 6%, transparent)'),
        # type-string (7dcb9e)
        (r'rgba\(125,203,158,0\.3\)', r'color-mix(in srgb, var(--green) 30%, transparent)'),
        (r'rgba\(125,203,158,0\.06\)', r'color-mix(in srgb, var(--green) 6%, transparent)'),
        # boolean (7e9ee8 -> roughly accent-cool)
        (r'rgba\(126,158,232,0\.3\)', r'color-mix(in srgb, var(--accent-cool) 30%, transparent)'),
        (r'rgba\(126,158,232,0\.06\)', r'color-mix(in srgb, var(--accent-cool) 6%, transparent)'),
        # heat
        (r'rgba\(212,70,70,0\.35\)', r'color-mix(in srgb, var(--red) 35%, transparent)'),
        (r'rgba\(212,70,70,0\.8\)', r'color-mix(in srgb, var(--red) 80%, transparent)'),
    ]

    for pattern, repl in replacements:
        content = re.sub(pattern, repl, content)

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

if __name__ == '__main__':
    process_file(sys.argv[1])
