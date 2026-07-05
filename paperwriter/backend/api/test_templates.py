from django.test import TestCase
from django.contrib.auth.models import User
from .models import Document, Author, Section, PaperImage, Reference, PaperTable

class TemplateCoverageTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='templatetester', email='test@temp.com', password='password')
        self.document = Document.objects.create(user=self.user, title='Template Coverage Test')
        # Setup rich document to test all formatters
        self.section = Section.objects.create(document=self.document, title='Test Sec', order=1, content='<p>Test Content</p>')
        self.image = PaperImage.objects.create(document=self.document, image_base64='dummy', label='fig:test', section=self.section)
        self.table = PaperTable.objects.create(document=self.document, section=self.section, style='standard', content='[["A", "B"], ["1", "2"]]')
        self.reference = Reference.objects.create(document=self.document, citation_key='test', bibtex='@article{test, title={Test}}')

    def test_all_templates_compile_without_errors(self):
        from .templates.registry import TemplateRegistry
        for template_class in TemplateRegistry.choices():
            template_instance = template_class()
            try:
                # Test preamble
                preamble = template_instance.build_preamble(self.document)
                self.assertIsInstance(preamble, str)
                
                # Test title block
                title_block = template_instance.build_title_block(self.document)
                self.assertIsInstance(title_block, str)
                
                # Test full generation
                latex_source = template_instance.generate(self.document)
                self.assertIsInstance(latex_source, str)
                self.assertIn(r'\begin{document}', latex_source)
                self.assertIn(r'\end{document}', latex_source)
            except Exception as e:
                self.fail(f'Template {template_class.id} failed with exception: {e}')
