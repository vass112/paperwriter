import os
import django
import sys
sys.path.append('c:\\Users\\DELL\\Desktop\\paperwriter\\paperwriter\\backend')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from api.models import Document, Section, PaperImage
from api.views import generate_latex_source

doc = Document.objects.filter(title__icontains='Sample').first()
for sec in doc.sections.all():
    print('--- SECTION ---')
    print(sec.content)

print('\n=== LATEX ===')
print(generate_latex_source(doc))
