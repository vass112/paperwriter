import os
import django
from django.conf import settings

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'paperwriter.settings')
django.setup()

from api.models import Document, Section

def seed():
    if not Document.objects.exists():
        new_doc = Document.objects.create(title="My First Academic Paper")
        
        sections = [
            Section(title="Abstract", section_type="abstract", order=1, document=new_doc),
            Section(title="Introduction", section_type="intro", order=2, document=new_doc),
            Section(title="Related Work", section_type="related_work", order=3, document=new_doc),
            Section(title="Methodology", section_type="methodology", order=4, document=new_doc),
            Section(title="Results", section_type="results", order=5, document=new_doc),
            Section(title="Discussion", section_type="discussion", order=6, document=new_doc),
            Section(title="Conclusion", section_type="conclusion", order=7, document=new_doc),
            Section(title="References", section_type="references", order=8, document=new_doc),
        ]
        Section.objects.bulk_create(sections)
        print("Database seeded!")
    else:
        print("Database already contains data.")

if __name__ == '__main__':
    seed()
