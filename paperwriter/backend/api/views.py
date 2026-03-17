from django.shortcuts import render
from rest_framework import viewsets, generics, status
from rest_framework.response import Response
from rest_framework.decorators import api_view
from rest_framework.parsers import MultiPartParser, FormParser
from .models import Document, Section, Author, PaperImage
from .serializers import DocumentSerializer, SectionSerializer, AuthorSerializer, PaperImageSerializer
import google.generativeai as genai
from django.conf import settings
from django.db.models import F

def home(request):
    return render(request, 'index.html')

class DocumentViewSet(viewsets.ModelViewSet):
    queryset = Document.objects.all()
    serializer_class = DocumentSerializer

class SectionUpdateView(generics.UpdateAPIView):
    queryset = Section.objects.all()
    serializer_class = SectionSerializer

class AuthorViewSet(viewsets.ModelViewSet):
    queryset = Author.objects.all()
    serializer_class = AuthorSerializer

    def create(self, request, *args, **kwargs):
        print(f"Adding author: {request.data}")
        serializer = self.get_serializer(data=request.data)
        if not serializer.is_valid():
            print(f"Validation error: {serializer.errors}")
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        self.perform_create(serializer)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

class PaperImageViewSet(viewsets.ModelViewSet):
    queryset = PaperImage.objects.all()
    serializer_class = PaperImageSerializer
    from rest_framework.parsers import JSONParser
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['request'] = self.request
        return context

    def get_queryset(self):
        qs = super().get_queryset()
        doc_id = self.request.query_params.get('document')
        if doc_id:
            qs = qs.filter(document=doc_id)
        return qs


@api_view(['POST'])
def process_ai_command(request):
    command = request.data.get('command')
    selected_text = request.data.get('selected_text')
    section_context = request.data.get('section_context', "Academic Section")
    
    if not command or not selected_text:
        return Response({'error': 'Missing command or text'}, status=400)
    
    try:
        api_key = settings.GEMINI_API_KEY
        if not api_key:
            return Response({'error': 'GEMINI_API_KEY not configured'}, status=500)
            
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel('gemini-2.0-flash')
        
        prompt = f"""
        You are an expert academic editor. Your task is to process the following text based on the user's command.
        
        Context (Section Type): {section_context}
        
        User Command: "{command}"
        
        Selected Text:
        "{selected_text}"
        
        Instructions:
        1. Return ONLY the modified text.
        2. Do not include any conversational filler.
        3. Maintain academic tone and standard formatting.
        """
        
        response = model.generate_content(prompt)
        return Response({'result': response.text.strip()})
        
    except Exception as e:
        return Response({'error': str(e)}, status=500)


import zipfile
import io
import os
from django.conf import settings

def generate_latex_source(document):
    """Generate complete LaTeX source code for a document"""
    latex_content = [
        r"\documentclass[conference]{IEEEtran}",
        r"\IEEEoverridecommandlockouts",
        r"\usepackage{cite}",
        r"\usepackage{amsmath,amssymb,amsfonts}",
        r"\usepackage{algorithmic}",
        r"\usepackage{graphicx}",
        r"\usepackage{textcomp}",
        r"\usepackage{xcolor}",
        r"\def\BibTeX{{\rm B\kern-.05em{\sc i\kern-.025em b}\kern-.08em",
        r"    T\kern-.1667em\lower.7ex\hbox{E}\kern-.125emX}}",
        r"\begin{document}",
        "",
        f"\\title{{{document.title}}}",
        "",
    ]
    
    # Generate author block
    authors = document.authors.all().order_by('order')
    if authors.exists():
        author_blocks = []
        for idx, author in enumerate(authors, 1):
            ordinal = f"{idx}\\textsuperscript{{st}}" if idx == 1 else f"{idx}\\textsuperscript{{nd}}" if idx == 2 else f"{idx}\\textsuperscript{{rd}}" if idx == 3 else f"{idx}\\textsuperscript{{th}}"
            
            author_block = f"\\IEEEauthorblockN{{{ordinal} {author.name}}}"
            affiliation_parts = []
            if author.department:
                affiliation_parts.append(f"\\textit{{{author.department}}}")
            if author.organization:
                affiliation_parts.append(f"\\textit{{{author.organization}}}")
            if author.city or author.country:
                location = ", ".join(filter(None, [author.city, author.country]))
                affiliation_parts.append(location)
            if author.email:
                affiliation_parts.append(author.email)
            
            if affiliation_parts:
                author_block += "\n" + "\\IEEEauthorblockA{" + " \\\\\n".join(affiliation_parts) + "}"
            
            author_blocks.append(author_block)
        
        latex_content.append("\\author{" + "\n\\and\n".join(author_blocks) + "\n}")
    else:
        # Fallback to placeholder
        latex_content.extend([
            r"\author{\IEEEauthorblockN{1\textsuperscript{st} Given Name Surname}",
            r"\IEEEauthorblockA{\textit{dept. name of organization (of Aff.)} \\",
            r"\textit{name of organization (of Aff.)}\\",
            r"City, Country \\",
            r"email address or ORCID}",
            r"}",
        ])
    
    latex_content.extend([
        "",
        r"\maketitle",
    ])
    
    import re, os as _os

    sections = document.sections.all().order_by('order')

    # Pre-build a map: section_id -> list of images assigned to it
    all_images = list(document.images.all().order_by('order', 'uploaded_at'))
    section_images = {}   # section_id -> [img, ...]
    unassigned_images = []
    for img in all_images:
        if img.section_id:
            section_images.setdefault(img.section_id, []).append(img)
        else:
            unassigned_images.append(img)

    def emit_figure(img):
        """Return a list of LaTeX lines for a single figure."""
        filename = _os.path.basename(img.image.name)
        label    = img.label or f'fig{img.id}'
        caption  = img.caption or ''
        width    = max(0.1, min(1.0, img.width or 0.9))
        lines = [
            r"\begin{figure}[htbp]",
            r"\centering",
            f"\\includegraphics[width={width:.2f}\\columnwidth]{{{filename}}}",
        ]
        if caption:
            lines.append(f"\\caption{{{caption}}}")
        lines.append(f"\\label{{{label}}}")
        lines.append(r"\end{figure}")
        lines.append("")
        return lines

    for section in sections:
        content = section.content or ""
        text = re.sub(r'<p>(.*?)</p>', r'\1\n\n', content)
        text = re.sub(r'<h3>(.*?)</h3>', r'\\subsection{\1}\n\n', text)
        text = re.sub(r'<h4>(.*?)</h4>', r'\\subsubsection{\1}\n\n', text)
        text = re.sub(r'<strong>(.*?)</strong>', r'\\textbf{\1}', text)
        text = re.sub(r'<em>(.*?)</em>', r'\\textit{\1}', text)
        text = text.replace('&nbsp;', ' ').replace('&lt;', '<').replace('&gt;', '>')
        processed_content = text.strip()

        if section.section_type == 'abstract':
            latex_content.append(r"\begin{abstract}")
            latex_content.append(processed_content)
            latex_content.append(r"\end{abstract}")
            latex_content.append(r"\begin{IEEEkeywords}")
            latex_content.append(r"component, formatting, style, styling, insert.")
            latex_content.append(r"\end{IEEEkeywords}")
        elif section.section_type == 'references':
            latex_content.append(r"\section{References}")
            latex_content.append(processed_content)
        else:
            latex_content.append(f"\\section{{{section.title}}}")
            latex_content.append(processed_content)

        # Emit figures assigned to this section
        for img in section_images.get(section.id, []):
            latex_content.extend(emit_figure(img))

    # Emit unassigned figures at the end
    for img in unassigned_images:
        latex_content.extend(emit_figure(img))

    latex_content.append(r"\end{document}")
    return "\n".join(latex_content)

@api_view(['GET'])
def get_latex_source(request, doc_id):
    """Return the LaTeX source code for live preview"""
    try:
        document = Document.objects.get(id=doc_id)
        latex_source = generate_latex_source(document)
        return Response({'latex': latex_source})
    except Document.DoesNotExist:
        return Response({'error': 'Document not found'}, status=404)

@api_view(['GET'])
def export_pdf(request, doc_id):
    """Compile LaTeX to PDF and return it"""
    try:
        document = Document.objects.get(id=doc_id)
        latex_source = generate_latex_source(document)
        
        # Create temporary directory for compilation
        import tempfile
        import subprocess
        
        with tempfile.TemporaryDirectory() as tmpdir:
            # Write LaTeX file
            tex_path = os.path.join(tmpdir, 'paper.tex')
            with open(tex_path, 'w', encoding='utf-8') as f:
                f.write(latex_source)
            
            # Copy IEEEtran.cls
            cls_source = os.path.join(settings.BASE_DIR.parent, 'ieee_format', 'IEEEtran.cls')
            import shutil
            if os.path.exists(cls_source):
                shutil.copy(cls_source, os.path.join(tmpdir, 'IEEEtran.cls'))

            # Copy uploaded images into tmpdir
            for img in document.images.all():
                img_disk_path = img.image.path
                if os.path.exists(img_disk_path):
                    shutil.copy(img_disk_path, os.path.join(tmpdir, os.path.basename(img_disk_path)))
            
            # Try to compile with pdflatex
            try:
                # Update PATH to include MiKTeX
                import copy
                env = copy.copy(os.environ)
                
                # Add common MiKTeX paths
                miktex_paths = [
                    r"C:\Program Files\MiKTeX\miktex\bin\x64",
                    r"C:\Users\DELL\AppData\Local\Programs\MiKTeX\miktex\bin\x64",
                    os.path.expanduser(r"~\AppData\Local\Programs\MiKTeX\miktex\bin\x64"),
                ]
                
                for miktex_path in miktex_paths:
                    if os.path.exists(miktex_path):
                        env['PATH'] = miktex_path + os.pathsep + env.get('PATH', '')
                        break
                
                # Run pdflatex twice for proper references
                for _ in range(2):
                    result = subprocess.run(
                        ['pdflatex', '-interaction=nonstopmode', 'paper.tex'],
                        cwd=tmpdir,
                        capture_output=True,
                        timeout=120,
                        env=env
                    )
                
                pdf_path = os.path.join(tmpdir, 'paper.pdf')
                if os.path.exists(pdf_path):
                    with open(pdf_path, 'rb') as f:
                        pdf_content = f.read()
                    
                    from django.http import HttpResponse
                    response = HttpResponse(pdf_content, content_type='application/pdf')
                    response['Content-Disposition'] = f'attachment; filename=paper_{doc_id}.pdf'
                    return response
                else:
                    return Response({'error': 'PDF compilation failed', 'log': result.stderr.decode()}, status=500)
                    
            except FileNotFoundError:
                # pdflatex not available, return error with suggestion
                return Response({
                    'error': 'LaTeX compiler not installed',
                    'message': 'Please install MiKTeX or TeX Live to enable PDF export'
                }, status=503)
            except subprocess.TimeoutExpired:
                return Response({'error': 'Compilation timeout'}, status=500)
                
    except Document.DoesNotExist:
        return Response({'error': 'Document not found'}, status=404)

@api_view(['GET'])
def export_latex(request, doc_id):
    """Export LaTeX project as ZIP"""
    try:
        document = Document.objects.get(id=doc_id)
        latex_source = generate_latex_source(document)

        # Create ZIP in memory
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
            zip_file.writestr(f"paper_{doc_id}.tex", latex_source)
            
            cls_path = os.path.join(settings.BASE_DIR.parent, 'ieee_format', 'IEEEtran.cls')
            if os.path.exists(cls_path):
                zip_file.write(cls_path, 'IEEEtran.cls')
            
            fig_path = os.path.join(settings.BASE_DIR.parent, 'ieee_format', 'fig1.png')
            if os.path.exists(fig_path):
                zip_file.write(fig_path, 'fig1.png')

        from django.http import HttpResponse
        response = HttpResponse(zip_buffer.getvalue(), content_type="application/zip")
        response['Content-Disposition'] = f'attachment; filename=paper_{doc_id}_project.zip'
        return response
        
    except Document.DoesNotExist:
        return Response({'error': 'Document not found'}, status=404)
