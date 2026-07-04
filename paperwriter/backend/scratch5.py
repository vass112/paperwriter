from api.models import Document
from api.views import generate_latex_source
from rest_framework.test import APIRequestFactory
from api.views import export_pdf

doc = Document.objects.filter(title__icontains='Sample').first()
if doc:
    print(f"Generating PDF for {doc.id}...")
    factory = APIRequestFactory()
    request = factory.get(f'/api/document/{doc.id}/export/pdf')
    # mock user
    from django.contrib.auth.models import User
    user = User.objects.first()
    request.user = user
    response = export_pdf(request, doc_id=doc.id)
    print("Response status:", response.status_code)
    if response.status_code != 200:
        print("Response data:", response.data if hasattr(response, 'data') else response.content)
