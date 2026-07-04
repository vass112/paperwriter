from .registry import TemplateRegistry
from .base import BaseTemplate

@TemplateRegistry.register
class IEEETemplate(BaseTemplate):
    id = 'ieee'
    name = 'IEEE'
    class_file = 'IEEEtran.cls'
    bib_style = 'IEEEtran'
    use_vertical_rules = True
    
    available_styles = {
        'conference': {
            'display': 'Conference',
            'docclass_declaration': r'\documentclass[conference]{IEEEtran}',
        },
        'journal': {
            'display': 'Journal',
            'docclass_declaration': r'\documentclass[journal]{IEEEtran}',
        },
        'compsoc-conf': {
            'display': 'Computer Society Conference',
            'docclass_declaration': r'\documentclass[conference,compsoc]{IEEEtran}',
        },
        'compsoc-journal': {
            'display': 'Computer Society Journal',
            'docclass_declaration': r'\documentclass[journal,compsoc]{IEEEtran}',
        },
        'comsoc-conf': {
            'display': 'Communications Society Conference',
            'docclass_declaration': r'\documentclass[conference,comsoc]{IEEEtran}',
        },
        'comsoc-journal': {
            'display': 'Communications Society Journal',
            'docclass_declaration': r'\documentclass[journal,comsoc]{IEEEtran}',
        },
        'technote': {
            'display': 'Technote / Correspondence',
            'docclass_declaration': r'\documentclass[technote]{IEEEtran}',
        },
    }

    packages = [
        r'\IEEEoverridecommandlockouts',
        r'\usepackage{cite}',
        r'\usepackage{amsmath,amssymb,amsfonts}',
        r'\usepackage{algorithmic}',
        r'\usepackage{graphicx}',
        r'\usepackage{booktabs}',
        r'\usepackage{textcomp}',
        r'\usepackage{xcolor}',
        r'\def\BibTeX{{\rm B\kern-.05em{\sc i\kern-.025em b}\kern-.08em',
        r'    T\kern-.1667em\lower.7ex\hbox{E}\kern-.125emX}}',
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
        lines.extend([r'\begin{document}', r'\sloppy', '', f'\\title{{{document.title}}}', ''])
        return '\n'.join(lines)

    def build_title_block(self, document):
        result = []
        authors = document.authors.all().order_by('order')
        if authors.exists():
            author_blocks = []
            for idx, author in enumerate(authors, 1):
                ordinal = f"{idx}\\textsuperscript{{st}}" if idx == 1 else f"{idx}\\textsuperscript{{nd}}" if idx == 2 else f"{idx}\\textsuperscript{{rd}}" if idx == 3 else f"{idx}\\textsuperscript{{th}}"
                
                author_block = f"\\IEEEauthorblockN{{{ordinal} {author.name}}}"
                affiliation_parts = []
                if author.department:
                    affiliation_parts.append(f"\\textit{{{author.department}}}")
                if author.organization:
                    affiliation_parts.append(f"\\textit{{{author.organization}}}")
                if author.city or author.country:
                    location = ", ".join(filter(None, [author.city, author.country]))
                    affiliation_parts.append(location)
                if author.email:
                    affiliation_parts.append(author.email)

                if affiliation_parts:
                    author_block += "\n" + "\\IEEEauthorblockA{" + " \\\\\n".join(affiliation_parts) + "}"
                author_blocks.append(author_block)

            result.append("\\author{" + "\n\\and\n".join(author_blocks) + "\n}")
        else:
            result.extend([
                r"\author{\IEEEauthorblockN{1\textsuperscript{st} Given Name Surname}",
                r"\IEEEauthorblockA{\textit{dept. name of organization (of Aff.)} \\",
                r"\textit{name of organization (of Aff.)}\\",
                r"City, Country \\",
                r"email address or ORCID}",
                r"}",
            ])
        result.extend(['', r'\maketitle'])
        return '\n'.join(result)

    def build_abstract(self, content, document):
        return f'\\begin{{abstract}}\n{content}\n\\end{{abstract}}'

    def build_keywords(self, document):
        if document.index_terms:
            return f'\\begin{{IEEEkeywords}}\n{document.index_terms}\n\\end{{IEEEkeywords}}'
        return ''
