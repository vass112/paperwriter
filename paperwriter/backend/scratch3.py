import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from api.models import Document
from api.views import generate_latex_source

doc = Document.objects.filter(title__icontains='Sample').first()
if doc:
    latex = generate_latex_source(doc)
    print("----- START LATEX -----")
    print(latex)
    print("----- END LATEX -----")
else:
    print("Doc not found")
