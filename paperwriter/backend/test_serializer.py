import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "paperwriter.settings")
django.setup()

from api.models import Document
from api.serializers import DocumentSerializer

doc = Document.objects.first()
if doc:
    try:
        data = DocumentSerializer(doc).data
        print("Success:", str(data)[:100])
    except Exception as e:
        import traceback
        traceback.print_exc()
else:
    print("No docs")
