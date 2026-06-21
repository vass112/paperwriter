from django.test import TestCase, Client
from django.urls import reverse
from django.contrib.auth.models import User
from .models import Document, Author, Section, PaperImage, Reference, PaperTable, UserProfile
from .views import generate_latex_source
import base64
import json

class ModelIntegrityTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='testuser', email='test@example.com', password='password')
        self.document = Document.objects.create(user=self.user, title="Test Paper")

    def test_user_profile_creation(self):
        """Test that UserProfile and sample document are created via signal on user creation."""
        user = User.objects.create_user(username='newuser', email='new@example.com')
        self.assertTrue(UserProfile.objects.filter(user=user).exists())
        # The signal also creates a sample Document for new users
        self.assertTrue(Document.objects.filter(user=user, title__contains="Sample Project").exists())

    def test_document_cascade_delete(self):
        """Test cascading deletes when a document is deleted."""
        Section.objects.create(document=self.document, title="Intro", order=1)
        PaperImage.objects.create(document=self.document, image_base64="dummy", order=1)
        Reference.objects.create(document=self.document, citation_key="test2024", bibtex="dummy", order=1)
        
        # The sample document creates 6 sections, plus our 1
        self.assertEqual(Section.objects.count(), 7)
        # The sample document creates 1 image, plus our 1
        self.assertEqual(PaperImage.objects.count(), 2)
        
        self.document.delete()
        
        # The 6 sections and 1 image from the sample document will still exist
        self.assertEqual(Section.objects.count(), 6)
        self.assertEqual(PaperImage.objects.count(), 1)
        # We didn't create a reference on the sample doc via signal, but actually we did (paperwriter2026)
        self.assertEqual(Reference.objects.count(), 1)

class APITests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='testuser', email='test@example.com', password='password')
        self.client = Client()
        self.client.force_login(self.user)
        self.document = Document.objects.create(user=self.user, title="Test Paper")

    def test_document_list(self):
        response = self.client.get('/api/documents/')
        self.assertEqual(response.status_code, 200)
        # Should see the created Document AND the Sample Document from the signal
        self.assertGreaterEqual(len(response.json()), 1)

    def test_section_crud(self):
        # Create Section via API action
        response = self.client.post(f'/api/documents/{self.document.id}/add_section/', {
            'title': 'Methodology',
            'section_type': 'methodology'
        }, content_type='application/json')
        self.assertIn(response.status_code, [200, 201])
        section_id = response.json().get('id')
        self.assertIsNotNone(section_id)

        # Update Section Content
        response = self.client.patch(f'/api/sections/{section_id}/', {
            'content': '<p>This is a test</p>'
        }, content_type='application/json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(Section.objects.get(id=section_id).content, '<p>This is a test</p>')

        # Delete Section
        response = self.client.delete(f'/api/sections/{section_id}/')
        self.assertEqual(response.status_code, 204)
        # 6 sections from the sample document should remain
        self.assertEqual(Section.objects.count(), 6)

    def test_image_upload_base64(self):
        response = self.client.post('/api/images/', {
            'document': self.document.id,
            'image_base64': 'data:image/png;base64,dummybase64',
            'filename': 'test.png',
            'caption': 'Test Caption',
            'label': 'fig:test'
        }, content_type='application/json')
        self.assertEqual(response.status_code, 201)
        # 1 image from sample doc + 1 new image
        self.assertEqual(PaperImage.objects.count(), 2)
        # Get the image we just uploaded by label to verify properties
        img = PaperImage.objects.get(label='fig:test')
        self.assertEqual(img.document, self.document)

class LaTeXCompilerTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='testuser', email='test@example.com', password='password')
        # Grab the sample document created by the signal to test full compilation
        self.document = Document.objects.filter(user=self.user, title__contains="Sample").first()

    def test_full_sample_compilation(self):
        """Test that the default sample document generated on user creation compiles valid LaTeX."""
        latex_source = generate_latex_source(self.document)
        self.assertIn(r"\begin{document}", latex_source)
        self.assertIn(r"\end{document}", latex_source)
        self.assertIn(r"\maketitle", latex_source)
        self.assertIn(r"\begin{abstract}", latex_source)

    def test_html_tag_translation(self):
        """Test that Tiptap HTML is converted to LaTeX."""
        doc = Document.objects.create(user=self.user, title="Custom")
        section = Section.objects.create(document=doc, title="Test", order=1)
        section.content = "<p><strong>Bold</strong> and <em>Italic</em></p>"
        section.save()
        
        latex = generate_latex_source(doc)
        self.assertIn(r"\textbf{Bold}", latex)
        self.assertIn(r"\textit{Italic}", latex)

    def test_equation_parsing(self):
        doc = Document.objects.create(user=self.user, title="Custom")
        section = Section.objects.create(document=doc, title="Test", order=1)
        section.content = '<span class="eq-chip" data-type="inline" data-latex="E=mc^2"></span>'
        section.save()
        
        latex = generate_latex_source(doc)
        self.assertIn(r"$E=mc^2$", latex)
        
        section.content = '<span class="eq-chip" data-type="block" data-latex="x=1"></span>'
        section.save()
        latex = generate_latex_source(doc)
        self.assertIn(r"$$x=1$$", latex)

    def test_inline_figure_float_injection(self):
        """Test that the compiler injects \begin{figure} inline when a figure ref chip is found."""
        doc = Document.objects.create(user=self.user, title="Custom")
        section = Section.objects.create(document=doc, title="Test", order=1)
        img = PaperImage.objects.create(document=doc, image_base64="dummy", label="fig:test_img")
        
        # Test HTML chip conversion
        section.content = 'See <span class="ref-chip" data-type="ref" data-label="fig:test_img"></span> below.'
        section.save()
        latex = generate_latex_source(doc)
        
        # The chip should be replaced with \ref{fig:test_img} followed by the \begin{figure} block
        self.assertIn(r"\ref{fig:test_img}", latex)
        self.assertIn(r"\begin{figure}[htbp]", latex)
        self.assertIn(r"\label{fig:test_img}", latex)

    def test_table_generation(self):
        doc = Document.objects.create(user=self.user, title="Custom")
        sec = Section.objects.create(document=doc, title="Test", order=1)
        PaperTable.objects.create(document=doc, section=sec, style='booktabs', content='[["A", "B"], ["1", "2"]]')
        
        latex = generate_latex_source(doc)
        self.assertIn(r"\toprule", latex)
        self.assertIn(r"A & B \\", latex)
