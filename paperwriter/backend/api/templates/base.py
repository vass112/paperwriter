import os
import re
import json

class BaseTemplate:
    id = ''
    name = ''
    available_styles = {}
    class_file = None
    bib_style = None
    additional_class_files = []
    use_vertical_rules = True

    def __init__(self):
        if self.class_file:
            self.class_file_path = os.path.join(
                os.path.dirname(__file__), 'classfiles', self.class_file
            )
        else:
            self.class_file_path = None
        self.packages = []
        self.default_sections = []

    def get_style_config(self, style_id):
        return self.available_styles.get(style_id, list(self.available_styles.values())[0] if self.available_styles else {})

    def build_preamble(self, document):
        raise NotImplementedError

    def build_title_block(self, document):
        raise NotImplementedError

    def build_abstract(self, content, document):
        return ''

    def build_keywords(self, document):
        return ''

    def format_section_cmd(self, title, depth):
        cmds = ['section', 'subsection', 'subsubsection', 'paragraph']
        cmd = cmds[min(depth-1, len(cmds)-1)]
        return f'\\{cmd}{{{title}}}'

    def build_bibliography(self, document):
        if document.references.exists() and self.bib_style:
            return f'\\bibliographystyle{{{self.bib_style}}}\n\\bibliography{{refs}}'
        return ''

    def emit_figure(self, img):
        filename = img.filename.replace(" ", "_")
        label = img.label or f'fig{img.id}'
        caption = img.caption or ''
        width = max(0.1, min(1.0, img.width or 0.9))
        lines = [
            r"\begin{figure}[htbp]",
            r"\centering",
            f"\\includegraphics[width={width:.2f}\\columnwidth]{{{filename}}}",
        ]
        if caption:
            lines.append(f"\\caption{{{caption}}}")
        lines.append(f"\\label{{{label}}}")
        lines.append(r"\end{figure}")
        lines.append("")
        return lines

    def emit_table(self, table):
        label = table.label or f'tab{table.id}'
        caption = table.caption or ''
        try:
            grid = json.loads(table.content)
        except Exception:
            grid = [["Column 1", "Column 2"], ["Data 1", "Data 2"]]

        if not isinstance(grid, list) or not grid:
            return []

        cols_count = max(len(row) for row in grid) if grid else 0
        if cols_count == 0:
            return []

        style = getattr(table, 'style', 'standard')

        if style == 'booktabs' or style == 'no_vertical' or style == 'minimal' or not self.use_vertical_rules:
            col_format = "c" * cols_count
        else:
            col_format = "|" + "c|" * cols_count

        lines = [
            r"\begin{table}[htbp]",
            r"\centering",
            f"\\caption{{{caption}}}" if caption else "",
            f"\\label{{{label}}}",
            f"\\begin{{tabular}}{{{col_format}}}",
        ]

        if style == 'booktabs' or style == 'minimal':
            lines.append(r"\toprule")
        else:
            lines.append(r"\hline")

        for i, row in enumerate(grid):
            cells = [str(cell) for cell in row] + [""] * (cols_count - len(row))
            clean_cells = []
            for cell in cells:
                c = cell.replace('&', r'\&').replace('%', r'\%').replace('$', r'\$').replace('_', r'\_').replace('#', r'\#')
                clean_cells.append(c)

            row_str = " & ".join(clean_cells) + r" \\"

            if i == 0:
                if style == 'booktabs':
                    row_str += r" \midrule"
                elif style == 'minimal':
                    pass
                else:
                    row_str += r" \hline"
            else:
                if i == len(grid) - 1:
                    if style == 'booktabs' or style == 'minimal':
                        row_str += r" \bottomrule"
                    else:
                        row_str += r" \hline"
                else:
                    if style == 'standard':
                        row_str += r" \hline"

        lines.extend([
            r"\end{tabular}",
            r"\end{table}",
            ""
        ])
        return lines

    def process_content_html(self, content, document, section_images, section_tables, emitted_image_ids):
        if not content:
            return ""

        import html as html_module

        equations = []
        def unescape_latex(match):
            eq_type = match.group(1)
            latex = html_module.unescape(match.group(2))
            if eq_type == 'block':
                eq_str = f'$${latex}$$'
            else:
                eq_str = f'${latex}$'
            equations.append(eq_str)
            return f'__EQ_{len(equations)-1}__'

        text = re.sub(r'<span[^>]*class="eq-chip"[^>]*data-type="(inline|block)"[^>]*data-latex="([^"]+)"[^>]*>.*?</span>', unescape_latex, content)

        all_images = list(document.images.all())

        refs = []
        def process_ref_cite(match):
            ref_type = match.group(1)
            label = match.group(2)
            out = f'\\{ref_type}{{{label}}}'
            if ref_type == 'ref':
                img = next((i for i in all_images if i.label == label), None)
                if img and img.id not in emitted_image_ids:
                    emitted_image_ids.add(img.id)
                    out += '\n\n' + '\n'.join(self.emit_figure(img)) + '\n\n'
            refs.append(out)
            return f'__REF_{len(refs)-1}__'

        text = re.sub(r'<span[^>]*data-type="(ref|cite)"[^>]*data-label="([^"]+)"[^>]*>.*?</span>', process_ref_cite, text)

        def process_raw_ref(match):
            label = match.group(1)
            out = f'\\ref{{{label}}}'
            img = next((i for i in all_images if i.label == label), None)
            if img and img.id not in emitted_image_ids:
                emitted_image_ids.add(img.id)
                out += '\n\n' + '\n'.join(self.emit_figure(img)) + '\n\n'
            refs.append(out)
            return f'__REF_{len(refs)-1}__'

        text = re.sub(r'\\ref{([^}]+)}', process_raw_ref, text)

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

        return text.strip() + '\n\n'

    def _emit_sections(self, document):
        lines = []
        
        all_images = list(document.images.all().order_by('order', 'uploaded_at'))
        orphan_images = []
        section_images = {}
        for img in all_images:
            if img.section_id:
                section_images.setdefault(img.section_id, []).append(img)
            else:
                orphan_images.append(img)
                
        all_tables = list(document.tables.all().order_by('order', 'created_at'))
        section_tables = {}
        for t in all_tables:
            if t.section_id:
                section_tables.setdefault(t.section_id, []).append(t)
                
        emitted_image_ids = set()

        def emit_section(section, depth=1):
            local_lines = []
            content = self.process_content_html(section.content, document, section_images, section_tables, emitted_image_ids)

            if section.section_type == 'abstract':
                abstract = self.build_abstract(content, document)
                if abstract:
                    local_lines.append(abstract)
                kw = self.build_keywords(document)
                if kw:
                    local_lines.append(kw)
            elif section.section_type == 'references':
                if not document.references.exists():
                    local_lines.append(self.format_section_cmd(section.title, 1))
                    if content:
                        local_lines.append(content)
            else:
                local_lines.append(self.format_section_cmd(section.title, depth))
                    
                if content:
                    local_lines.append(content)

            for img in section_images.get(section.id, []):
                if img.id not in emitted_image_ids:
                    emitted_image_ids.add(img.id)
                    local_lines.extend(self.emit_figure(img))

            for t in section_tables.get(section.id, []):
                local_lines.extend(self.emit_table(t))

            for sub in section.subsections.all().order_by('order'):
                local_lines.extend(emit_section(sub, depth + 1))

            return local_lines

        for section in document.sections.filter(parent=None).order_by('order'):
            lines.extend(emit_section(section, 1))

        for img in orphan_images:
            if img.id not in emitted_image_ids:
                lines.extend(self.emit_figure(img))

        return '\n'.join(lines)

    def generate(self, document):
        parts = [
            self.build_preamble(document),
            self.build_title_block(document),
        ]
        
        sections_latex = self._emit_sections(document)
        parts.append(sections_latex)
        
        parts.append(self.build_bibliography(document))
        parts.append(r'\end{document}')
        
        return '\n'.join(filter(None, parts))
