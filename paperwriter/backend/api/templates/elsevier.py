from .registry import TemplateRegistry
from .base import BaseTemplate

@TemplateRegistry.register
class ElsevierTemplate(BaseTemplate):
    id = 'elsevier'
    name = 'Elsevier'
    class_file = 'elsarticle.cls'
    bib_style = 'elsarticle-num'
    use_vertical_rules = False
    
    available_styles = {
        'preprint': {'display': 'Preprint (Submission)', 'docclass_declaration': r'\documentclass[preprint,12pt]{elsarticle}'},
        'review':   {'display': 'Review (Double-spaced)', 'docclass_declaration': r'\documentclass[review,12pt]{elsarticle}'},
        '1p':       {'display': 'Final — Single Column', 'docclass_declaration': r'\documentclass[1p]{elsarticle}'},
        '3p':       {'display': 'Final — Two Column', 'docclass_declaration': r'\documentclass[3p]{elsarticle}'},
        '5p':       {'display': 'Final — Two Column', 'docclass_declaration': r'\documentclass[5p]{elsarticle}'},
    }

    packages = [
        r'\usepackage{graphicx}',
        r'\usepackage{booktabs}',
        r'\usepackage{amsmath,amssymb}',
        r'\usepackage[numbers]{natbib}',
    ]

    default_sections = [
        ('Abstract', 'abstract'),
        ('Introduction', 'intro'),
        ('Methods', 'methodology'),
        ('Results', 'results'),
        ('Discussion', 'discussion'),
        ('Conclusion', 'conclusion'),
        ('References', 'references'),
    ]

    def build_preamble(self, document):
        style = self.get_style_config(document.template_style)
        lines = [style['docclass_declaration']]
        lines.extend(self.packages)
        lines.append(r'\begin{document}')
        return '\n'.join(lines)

    def build_title_block(self, document):
        result = [r'\begin{frontmatter}', f'\\title{{{document.title}}}']
        authors = document.authors.all().order_by('order')
        if authors.exists():
            for i, author in enumerate(authors):
                affil_id = i + 1
                email_part = f'\\ead{{{author.email}}}' if author.email else ''
                result.append(f'\\author[{affil_id}]{{{author.name}}}{email_part}')
            for i, author in enumerate(authors):
                affil_id = i + 1
                loc_parts = filter(None, [author.department, author.organization,
                                          ', '.join(filter(None, [author.city, author.country]))])
                result.append(f'\\address[{affil_id}]{{' + '\\\\\n'.join(loc_parts) + '}')
        result.append(r'\end{frontmatter}')
        return '\n'.join(result)

    def build_abstract(self, content, document):
        return f'\\begin{{abstract}}\n{content}\n\\end{{abstract}}'

    def build_keywords(self, document):
        if document.index_terms:
            return f'\\begin{{keyword}}\n{document.index_terms}\n\\end{{keyword}}'
        return ''
