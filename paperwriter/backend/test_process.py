import re
import html as html_module

content = '''<p>Our methodology involves R&amp;D. 100% success. You can reference figures (e.g., see Figure <span data-type="ref" data-label="fig1"></span>) and tables (see Table <span data-type="ref" data-label="tab1"></span>) dynamically. <br> Stray tags</p>'''

all_images = []
emitted_image_ids = set()

def emit_figure(img):
    return [r"\begin{figure}[htbp]", r"FIGURE CONTENT", r"\end{figure}"]

equations = []
def unescape_latex(match):
    eq_type = match.group(1)
    latex = html_module.unescape(match.group(2))
    if eq_type == 'block':
        eq_str = f'{latex}'
    else:
        eq_str = f'$'
    equations.append(eq_str)
    return f'__EQ_{len(equations)-1}__'

text = re.sub(r'<span[^>]*class="eq-chip"[^>]*data-type="(inline|block)"[^>]*data-latex="([^"]+)"[^>]*>.*?</span>', unescape_latex, content)

refs = []
def process_ref_cite(match):
    ref_type = match.group(1)
    label = match.group(2)
    out = f'\\{ref_type}{{{label}}}'
    if ref_type == 'ref':
        # dummy
        out += '\n\n' + '\n'.join(emit_figure(None)) + '\n\n'
    refs.append(out)
    return f'__REF_{len(refs)-1}__'

text = re.sub(r'<span[^>]*data-type="(ref|cite)"[^>]*data-label="([^"]+)"[^>]*>.*?</span>', process_ref_cite, text)

text = re.sub(r'<p>(.*?)</p>', r'\1\n\n', text, flags=re.DOTALL)
text = re.sub(r'<h3>(.*?)</h3>', r'\1\n\n', text, flags=re.DOTALL)
text = re.sub(r'<h4>(.*?)</h4>', r'\1\n\n', text, flags=re.DOTALL)
text = re.sub(r'<strong>(.*?)</strong>', r'\\textbf{\1}', text, flags=re.DOTALL)
text = re.sub(r'<em>(.*?)</em>', r'\\textit{\1}', text, flags=re.DOTALL)

text = re.sub(r'<[^>]+>', '', text)
text = html_module.unescape(text)

text = text.replace('%', '\\%').replace('&', '\\&').replace('#', '\\#')

for i, ref_str in enumerate(refs):
    text = text.replace(f'__REF_{i}__', ref_str)

for i, eq_str in enumerate(equations):
    text = text.replace(f'__EQ_{i}__', eq_str)

print("----- OUTPUT -----")
print(text.strip() + '\n\n')
print("----- END -----")
