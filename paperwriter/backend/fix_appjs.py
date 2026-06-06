
with open('static/js/app.js', 'r', encoding='utf-8', errors='replace') as f:
    content = f.read()

# Find where corruption starts - the bad text "//\r\nGlobal\r\nExports" etc
# comes after deleteReference function's closing brace
corruption_markers = ['}\n//\r\nGlobal', '}\n// Global\r\nExports', '}\n//\nGlobal\nExports']
cut_pos = -1
for marker in corruption_markers:
    pos = content.find(marker)
    if pos != -1:
        cut_pos = pos + 1  # Keep the closing brace, trim everything after
        print(f'Found corruption at position {pos}')
        break

if cut_pos == -1:
    # Try another approach - find the last legitimate function close
    last_func_end = content.rfind('\n}\n\n//')
    if last_func_end != -1:
        # Check if what follows is garbage
        sample = content[last_func_end:last_func_end + 100]
        print(f'Sample after last func: {repr(sample)}')
        if 'Global' in sample or 'Triggering' in sample or 'Exports' in sample:
            cut_pos = last_func_end + 2  # Keep "}\n"
            print(f'Trimming from position {cut_pos}')

if cut_pos == -1:
    print('No corruption found, just ensuring footer is correct')
    good_content = content
    # Remove any existing footer duplicates
    footer_start = content.find('\n// Global Exports for Modal Triggering')
    if footer_start != -1:
        good_content = content[:footer_start]
        print(f'Removed existing footer at {footer_start}')
else:
    good_content = content[:cut_pos]

footer = """
// Global Exports for Modal Triggering
window.openAuthorsModal = openAuthorsModal;
window.closeAuthorsModal = closeAuthorsModal;
window.openImagesModal = openImagesModal;
window.closeImagesModal = closeImagesModal;
window.openReferencesModal = openReferencesModal;
window.closeReferencesModal = closeReferencesModal;

function cleanContent(html) {
    if (!html) return '';
    let cleaned = html.replace(/Skip to main content/gi, '');
    return cleaned;
}
"""

with open('static/js/app.js', 'w', encoding='utf-8') as f:
    f.write(good_content + footer)

print('Done. Verifying...')

with open('static/js/app.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

total = len(lines)
print(f'Total lines: {total}')
print('Last 10 lines:')
for l in lines[-10:]:
    print(repr(l))
