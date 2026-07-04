from api.models import Document, Section, PaperImage
from api.views import generate_latex_source

doc = Document.objects.filter(title__icontains='Sample').first()
latex = generate_latex_source(doc)
with open('clean_output.tex', 'w', encoding='utf-8') as f:
    f.write(latex)
