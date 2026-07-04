from api.models import Document
doc = Document.objects.filter(title__icontains='Sample').first()
if doc:
    for s in doc.sections.all().order_by('order'):
        print(f"TITLE: {s.title}")
        print(f"CONTENT: {s.content}")
        print("-----")
