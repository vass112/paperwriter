from .registry import TemplateRegistry
from .base import BaseTemplate

@TemplateRegistry.register
class MLATemplate(BaseTemplate):
    id = 'mla'
    name = 'MLA 9th Edition'
    class_file = None
    bib_style = 'mla-new'
    use_vertical_rules = True
    
    available_styles = {
        'student': {'display': 'Student Paper', 'docclass_declaration': r'\documentclass[12pt,letterpaper]{article}'},
        'professional': {'display': 'Professional Submission', 'docclass_declaration': r'\documentclass[12pt,letterpaper]{article}'},
    }

    packages = [
        r'\usepackage[utf8]{inputenc}',
        r'\usepackage[margin=1in]{geometry}',
        r'\usepackage{setspace}',
        r'\doublespacing',
        r'\usepackage{graphicx}',
        r'\usepackage{booktabs}',
        r'\usepackage{amsmath,amssymb}',
        r'\usepackage{natbib}',
        r'\pagestyle{myheadings}',
    ]

    default_sections = []

    def build_preamble(self, document):
        style = self.get_style_config(document.template_style)
        author_name = ''
        authors = document.authors.all().order_by('order')
        if authors.exists():
            author_name = authors[0].name.split()[-1]
            
        lines = [style['docclass_declaration']]
        lines.extend(self.packages)
        lines.append(f'\\markright{{{author_name}}}')
        lines.append(r'\begin{document}')
        return '\n'.join(lines)

    def build_title_block(self, document):
        result = []
        authors = document.authors.all().order_by('order')
        if authors.exists():
            result.append(authors[0].name + r'\\')
            if authors[0].organization:
                result.append(authors[0].organization + r'\\')
            result.append(r'Professor [Name]\\')
            result.append(r'[Course Number]\\')
            from datetime import date
            result.append(date.today().strftime('%d %B %Y') + r'\\')
        result.append('')
        result.append(f'\\begin{{center}}\n\\textbf{{{document.title}}}\n\\end{{center}}')
        return '\n'.join(result)

    def build_abstract(self, content, document):
        return ''

    def build_keywords(self, document):
        return ''
