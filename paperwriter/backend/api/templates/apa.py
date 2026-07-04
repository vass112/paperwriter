from .registry import TemplateRegistry
from .base import BaseTemplate

@TemplateRegistry.register
class APATemplate(BaseTemplate):
    id = 'apa'
    name = 'APA 7th Edition'
    class_file = 'apa7.cls'
    bib_style = 'apacite'
    use_vertical_rules = True
    
    available_styles = {
        'stu': {'display': 'Student Paper', 'docclass_declaration': r'\documentclass[stu]{apa7}'},
        'man': {'display': 'Professional Manuscript', 'docclass_declaration': r'\documentclass[man]{apa7}'},
        'jou': {'display': 'Journal Format', 'docclass_declaration': r'\documentclass[jou]{apa7}'},
        'doc': {'display': 'APA 6th Compatibility', 'docclass_declaration': r'\documentclass[doc]{apa7}'},
    }

    packages = [
        r'\usepackage{graphicx}',
        r'\usepackage{booktabs}',
        r'\usepackage{amsmath,amssymb}',
        r'\usepackage[natbibapa]{apacite}',
    ]

    default_sections = [
        ('Abstract', 'abstract'),
        ('Introduction', 'intro'),
        ('Method', 'methodology'),
        ('Results', 'results'),
        ('Discussion', 'discussion'),
        ('References', 'references'),
    ]

    def build_preamble(self, document):
        style = self.get_style_config(document.template_style)
        lines = [style['docclass_declaration']]
        lines.extend(self.packages)
        lines.append(r'\begin{document}')
        return '\n'.join(lines)

    def build_title_block(self, document):
        result = [f'\\title{{{document.title}}}']
        authors = document.authors.all().order_by('order')
        if authors.exists():
            result.append(f'\\author{{{", ".join(a.name for a in authors)}}}')
            affiliations = []
            for a in authors:
                parts = list(filter(None, [a.department, a.organization,
                                      ', '.join(filter(None, [a.city, a.country]))]))
                if parts:
                    affiliations.append(', '.join(parts))
            if affiliations:
                result.append(f'\\affiliation{{{". ".join(affiliations)}}}')
        result.append(r'\maketitle')
        return '\n'.join(result)

    def build_abstract(self, content, document):
        return f'\\begin{{abstract}}\n{content}\n\\end{{abstract}}'

    def format_section_cmd(self, title, depth):
        if depth == 1:
            return f'\\section{{{title}}}'
        elif depth == 2:
            return f'\\subsection{{{title}}}'
        elif depth == 3:
            return f'\\subsubsection{{{title}}}'
        elif depth == 4:
            return f'\\paragraph{{{title}}}'
        else:
            return f'\\subparagraph{{{title}}}'
