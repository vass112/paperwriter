import os
import django
import json

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'paperwriter.settings')
django.setup()

from django.test import Client
from api.models import Document, Section, Author, PaperImage, Reference, PaperTable, Comment
from api.views import generate_latex_source

def run_tests():
    print("=" * 60)
    print("STARTING PAPERSYSTEM FEATURE INTEGRATION TESTS")
    print("=" * 60)
    
    client = Client()
    
    # 1. Setup/get document
    doc = Document.objects.first()
    if not doc:
        doc = Document.objects.create(title="Test Verification Document")
    doc_id = doc.id
    print(f"[SETUP] Using Document ID: {doc_id} ('{doc.title}')")
    
    # 2. Test Document Retrieval
    response = client.get(f'/api/documents/{doc_id}/')
    assert response.status_code == 200, "Failed to retrieve document details"
    print("[PASS] Document Retrieval Endpoint works.")
    
    # 3. Test Author Creation, Listing, and Deletion
    # Create
    author_data = {
        "document": doc_id,
        "name": "Jane Doe Tester",
        "department": "Department of Verification",
        "organization": "Test University",
        "city": "Boston",
        "country": "USA",
        "email": "jane@test.org"
    }
    response = client.post('/api/authors/', author_data, content_type='application/json')
    assert response.status_code == 201, "Author creation failed"
    author_id = response.json()['id']
    print(f"[PASS] Author creation works. Author ID: {author_id}")
    
    # List
    response = client.get(f'/api/authors/?document={doc_id}')
    assert response.status_code == 200, "Listing authors failed"
    authors = response.json()
    assert any(a['id'] == author_id for a in authors), "Created author not found in list"
    print("[PASS] Author listing works.")
    
    # Delete
    response = client.delete(f'/api/authors/{author_id}/')
    assert response.status_code == 204, "Author deletion failed"
    print("[PASS] Author deletion endpoint works.")
    
    # 4. Test Table Creation with different styles and styles validation
    styles = ['standard', 'booktabs', 'no_vertical', 'minimal']
    for style in styles:
        table_data = {
            "document": doc_id,
            "caption": f"Verification Table {style.upper()}",
            "label": f"tab:verify_{style}",
            "style": style,
            "content": json.dumps([["Col A", "Col B"], ["Val 1", "Val 2"]])
        }
        response = client.post('/api/tables/', table_data, content_type='application/json')
        assert response.status_code == 201, f"Table creation failed for style {style}"
        table_id = response.json()['id']
        print(f"[PASS] Table creation works for style: {style}. Table ID: {table_id}")
        
        # Verify style field retrieved
        response = client.get(f'/api/tables/{table_id}/')
        assert response.json()['style'] == style, f"Table style did not persist for {style}"
        
        # Delete table
        del_resp = client.delete(f'/api/tables/{table_id}/')
        assert del_resp.status_code == 204, f"Table deletion failed for style {style}"
        print(f"[PASS] Table deletion works for style: {style}")

    # 5. Verify LaTeX Preamble contains booktabs package
    latex_source = generate_latex_source(doc)
    assert "\\usepackage{booktabs}" in latex_source, "booktabs package not found in LaTeX preamble!"
    print("[PASS] LaTeX Preamble correctly includes booktabs package.")

    # 6. Test References DOI autofill endpoint (offline/mocked fallback test)
    # The actual external fetch might be rate-limited or require network.
    # Let's test the endpoint behavior with invalid DOI first to make sure it handles errors gracefully.
    response = client.post('/api/references/fetch_doi', {"doi": "invalid_doi_format"}, content_type='application/json')
    assert response.status_code in [400, 500], "Invalid DOI did not return error status"
    print("[PASS] DOI Fetch correctly reports errors for invalid inputs.")

    # 7. Test PDF compilation and export
    # Running pdflatex integration check
    print("[RUNNING] Testing pdflatex compilation on backend...")
    response = client.get(f'/api/document/{doc_id}/export/pdf')
    # If miktex is not installed, it returns 503 suggesting compiler installation, which is a handled case.
    # If compiled successfully, it returns 200.
    assert response.status_code in [200, 503], f"PDF compilation returned unexpected status: {response.status_code}"
    if response.status_code == 200:
        print("[PASS] PDF Export compilation completed successfully! Returns application/pdf.")
    else:
        print("[INFO] PDF Export returned 503 (LaTeX compiler not installed on environment). This is a graceful fallback.")

    # 8. Test ZIP project export
    response = client.get(f'/api/document/{doc_id}/export/latex')
    assert response.status_code == 200, "ZIP export failed"
    assert response['Content-Type'] == "application/zip", "ZIP export did not return application/zip"
    print("[PASS] ZIP Project export completed successfully!")

    print("=" * 60)
    print("ALL TESTS PASSED SUCCESSFULLY!")
    print("=" * 60)

if __name__ == '__main__':
    run_tests()
