from .registry import TemplateRegistry
from .base import BaseTemplate

@TemplateRegistry.register
class SpringerTemplate(BaseTemplate):
    id = 'springer-lncs'
    name = 'Springer LNCS'
    class_file = 'llncs.cls'
    bib_style = 'splncs04'
    use_vertical_rules = True
    
    available_styles = {
        'runningheads': {'display': 'Standard', 'docclass_declaration': r'\documentclass[runningheads]{llncs}'},
    }

    packages = [
        r'\usepackage{graphicx}',
        r'\usepackage{booktabs}',
        r'\usepackage{amsmath,amssymb}',
    ]

    default_sections = [
        ('Abstract', 'abstract'),
        ('Introduction', 'intro'),
        ('Related Work', 'related_work'),
        ('Methodology', 'methodology'),
        ('Results', 'results'),
        ('Conclusion', 'conclusion'),
        ('References', 'references'),
    ]

    def build_preamble(self, document):
        style = self.get_style_config(document.template_style)
        lines = [style['docclass_declaration']]
        lines.extend(self.packages)
        lines.append(r'\begin{document}')
        lines.append(f'\\title{{{document.title}}}')
        if len(document.title) > 50:
            lines.append(f'\\titlerunning{{{document.title[:47]}...}}')
        return '\n'.join(lines)

    def build_title_block(self, document):
        result = []
        authors = document.authors.all().order_by('order')
        if authors.exists():
            author_parts = []
            for i, author in enumerate(authors):
                inst = f'\\inst{{{i + 1}}}'
                author_parts.append(f'{author.name}{inst}')
            result.append('\\author{\n' + '\\and\n'.join(author_parts) + '\n}')
            
            if len(authors) == 1:
                result.append(f'\\authorrunning{{{authors[0].name}}}')
            else:
                result.append(f'\\authorrunning{{{authors[0].name} et al.}}')
                
            for i, author in enumerate(authors):
                loc_parts = list(filter(None, [author.department, author.organization,
                                          ', '.join(filter(None, [author.city, author.country]))]))
                email = f'\\\\ \\email{{{author.email}}}' if author.email else ''
                result.append(f'\\institute{{{loc_parts[0] if loc_parts else ""} \\\\\n' + '\\\\\n'.join(loc_parts[1:]) + email + '}')
        
        result.append(r'\maketitle')
        return '\n'.join(result)

    def build_abstract(self, content, document):
        return f'\\begin{{abstract}}\n{content}\n\\end{{abstract}}'

    def build_keywords(self, document):
        if document.index_terms:
            return f'\\keywords{{{document.index_terms}}}'
        return ''
