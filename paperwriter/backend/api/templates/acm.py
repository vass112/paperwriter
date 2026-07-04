from .registry import TemplateRegistry
from .base import BaseTemplate

@TemplateRegistry.register
class ACMTemplate(BaseTemplate):
    id = 'acm'
    name = 'ACM'
    class_file = 'acmart.cls'
    bib_style = 'ACM-Reference-Format'
    use_vertical_rules = False
    
    available_styles = {
        'sigconf':   {'display': 'Conference (SIGCONF)', 'docclass_declaration': r'\documentclass[sigconf]{acmart}'},
        'acmsmall':  {'display': 'Journal (ACM Small)',  'docclass_declaration': r'\documentclass[acmsmall]{acmart}'},
        'acmlarge':  {'display': 'Journal (ACM Large)',  'docclass_declaration': r'\documentclass[acmlarge]{acmart}'},
        'acmtog':    {'display': 'Journal (ACM TOG)',    'docclass_declaration': r'\documentclass[acmtog]{acmart}'},
        'sigplan':   {'display': 'Conference (SIGPLAN)', 'docclass_declaration': r'\documentclass[sigplan]{acmart}'},
    }

    packages = [
        r'\setcopyright{rightsretained}',
        r'\usepackage{booktabs}',
        r'\usepackage{amsmath,amssymb}',
    ]

    default_sections = [
        ('Abstract', 'abstract'),
        ('Introduction', 'intro'),
        ('Related Work', 'related_work'),
        ('Methodology', 'methodology'),
        ('Evaluation', 'results'),
        ('Discussion', 'discussion'),
        ('Conclusion', 'conclusion'),
        ('References', 'references'),
    ]

    def build_preamble(self, document):
        style = self.get_style_config(document.template_style)
        lines = [style['docclass_declaration']]
        lines.extend(self.packages)
        lines.extend([r'\begin{document}', f'\\title{{{document.title}}}'])
        return '\n'.join(lines)

    def build_title_block(self, document):
        result = []
        authors = document.authors.all().order_by('order')
        if authors.exists():
            author_lines = []
            for author in authors:
                parts = [f'\\author{{{author.name}}}']
                affil_parts = []
                if author.department:
                    affil_parts.append(f'\\department{{{author.department}}}')
                if author.organization:
                    affil_parts.append(f'\\institution{{{author.organization}}}')
                loc = ', '.join(filter(None, [author.city, author.country]))
                if loc:
                    affil_parts.append(f'\\city{{{loc}}}')
                if author.email:
                    affil_parts.append(f'\\email{{{author.email}}}')
                if affil_parts:
                    parts.append('\\affiliation{\n  ' + '\n  '.join(affil_parts) + '\n}')
                author_lines.append('\n'.join(parts))
            result.append('\\author{\n' + '\n\\and\n'.join(author_lines) + '\n}')
        return '\n'.join(result)

    def build_abstract(self, content, document):
        return f'\\begin{{abstract}}\n{content}\n\\end{{abstract}}'

    def build_keywords(self, document):
        if document.index_terms:
            return f'\\keywords{{{document.index_terms}}}'
        return ''
