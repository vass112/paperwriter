from django.shortcuts import render
from rest_framework import viewsets, generics, status
from rest_framework.response import Response
from rest_framework.decorators import api_view, action
from rest_framework.parsers import MultiPartParser, FormParser
from .models import Document, Section, Author, PaperImage, Reference, PaperTable, Comment
from .serializers import DocumentSerializer, SectionSerializer, AuthorSerializer, PaperImageSerializer, ReferenceSerializer, PaperTableSerializer, CommentSerializer
import google.generativeai as genai
from django.conf import settings
from django.db.models import F
import os
from django.contrib.auth import login, logout
from django.contrib.auth.models import User
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

def home(request):
    return render(request, 'index.html', {'google_client_id': settings.GOOGLE_CLIENT_ID})

@api_view(['POST'])
def dev_login(request):
    """Bypass for local development so we don't need to configure Google OAuth origins for every local port."""
    if not settings.DEBUG:
        return Response({"error": "Only available in debug mode"}, status=status.HTTP_403_FORBIDDEN)
    
    user, created = User.objects.get_or_create(username='dev_test_user', email='dev@example.com')
    if created:
        user.first_name = 'Dev'
        user.last_name = 'User'
        user.save()
        UserProfile.objects.create(user=user)
    
    login(request, user)
    return Response({"success": True, "message": "Logged in as dev_test_user"})

@api_view(['POST'])
def google_auth(request):
    token = request.data.get('token')
    if not token:
        return Response({'error': 'Token is required'}, status=400)
    try:
        idinfo = id_token.verify_oauth2_token(token, google_requests.Request(), settings.GOOGLE_CLIENT_ID)
        email = idinfo['email']
        first_name = idinfo.get('given_name', '')
        last_name = idinfo.get('family_name', '')
        
        user, created = User.objects.get_or_create(
            username=email,
            defaults={
                'email': email,
                'first_name': first_name,
                'last_name': last_name
            }
        )
        login(request, user)
        profile = getattr(user, 'profile', None)
        consent = False
        if profile:
            consent = profile.dpdp_consent_processing
        return Response({'success': True, 'dpdp_consent': consent})
    except Exception as e:
        return Response({'error': str(e)}, status=400)

@api_view(['POST'])
def logout_user(request):
    logout(request)
    return Response({'success': True})

@api_view(['GET', 'POST'])
def user_profile(request):
    if not request.user.is_authenticated:
        return Response({'error': 'Not authenticated'}, status=401)
    
    profile = request.user.profile
    if request.method == 'GET':
        return Response({
            'username': request.user.username,
            'email': request.user.email,
            'first_name': request.user.first_name,
            'last_name': request.user.last_name,
            'dpdp_consent_processing': profile.dpdp_consent_processing,
            'dpdp_consent_communication': profile.dpdp_consent_communication,
            'dpdp_consent_date': profile.dpdp_consent_date
        })
    elif request.method == 'POST':
        from django.utils import timezone
        # If user explicitly gives consent now
        if request.data.get('dpdp_consent_processing') and not profile.dpdp_consent_processing:
            profile.dpdp_consent_date = timezone.now()
            
        profile.dpdp_consent_processing = request.data.get('dpdp_consent_processing', profile.dpdp_consent_processing)
        profile.dpdp_consent_communication = request.data.get('dpdp_consent_communication', profile.dpdp_consent_communication)
        profile.save()
        return Response({'success': True})

@api_view(['POST'])
def delete_account(request):
    if not request.user.is_authenticated:
        return Response({'error': 'Not authenticated'}, status=401)
    # Hard delete user for DPDP "Right to be Forgotten"
    user = request.user
    logout(request)
    user.delete()
    return Response({'success': True})


class DocumentViewSet(viewsets.ModelViewSet):
    queryset = Document.objects.all()
    serializer_class = DocumentSerializer

    def get_queryset(self):
        if self.request.user.is_authenticated:
            return Document.objects.filter(user=self.request.user)
        if not os.getenv('DATABASE_URL'):
            return Document.objects.all()
        return Document.objects.none()

    def perform_create(self, serializer):
        if self.request.user.is_authenticated:
            doc = serializer.save(user=self.request.user)
        else:
            doc = serializer.save()

        from .models import Section
        standard_sections = [
            ("Abstract", "abstract"),
            ("Introduction", "intro"),
            ("Related Work", "related_work"),
            ("Methodology", "methodology"),
            ("Results", "results"),
            ("Conclusion", "conclusion"),
            ("References", "references")
        ]
        
        for idx, (title, sec_type) in enumerate(standard_sections, start=1):
            Section.objects.create(
                document=doc,
                title=title,
                section_type=sec_type,
                order=idx
            )

    @action(detail=True, methods=['post'])
    def add_section(self, request, pk=None):
        document = self.get_object()
        title = request.data.get('title')
        parent_id = request.data.get('parent')
        section_type = request.data.get('section_type', 'custom')
        
        if not title:
            return Response({'error': 'Title is required'}, status=status.HTTP_400_BAD_REQUEST)
            
        parent = None
        if parent_id:
            try:
                parent = Section.objects.get(id=parent_id, document=document)
            except Section.DoesNotExist:
                return Response({'error': 'Parent section not found'}, status=status.HTTP_404_NOT_FOUND)
                
        # Determine order
        siblings = Section.objects.filter(document=document, parent=parent)
        order = siblings.count() + 1
        
        section = Section.objects.create(
            document=document,
            parent=parent,
            title=title,
            order=order,
            section_type=section_type
        )
        return Response(SectionSerializer(section).data, status=status.HTTP_201_CREATED)

class SectionViewSet(viewsets.ModelViewSet):
    queryset = Section.objects.all()
    serializer_class = SectionSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        doc_id = self.request.query_params.get('document')
        if doc_id:
            qs = qs.filter(document=doc_id)
        return qs

    @action(detail=True, methods=['post'])
    def move(self, request, pk=None):
        section = self.get_object()
        direction = request.data.get('direction')
        
        siblings = list(Section.objects.filter(document=section.document, parent=section.parent).order_by('order'))
        for idx, s in enumerate(siblings):
            if s.order != idx:
                s.order = idx
                s.save()
                
        current_idx = siblings.index(section)
        if direction == 'up' and current_idx > 0:
            siblings[current_idx], siblings[current_idx-1] = siblings[current_idx-1], siblings[current_idx]
        elif direction == 'down' and current_idx < len(siblings) - 1:
            siblings[current_idx], siblings[current_idx+1] = siblings[current_idx+1], siblings[current_idx]
        else:
            return Response({'status': 'no_change'})
            
        for idx, s in enumerate(siblings):
            Section.objects.filter(id=s.id).update(order=idx)
            
        return Response({'status': 'ok'})

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

class ReferenceViewSet(viewsets.ModelViewSet):
    queryset = Reference.objects.all()
    serializer_class = ReferenceSerializer

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
        r"\usepackage{booktabs}",
        r"\usepackage{textcomp}",
        r"\usepackage{xcolor}",
        r"\def\BibTeX{{\rm B\kern-.05em{\sc i\kern-.025em b}\kern-.08em",
        r"    T\kern-.1667em\lower.7ex\hbox{E}\kern-.125emX}}",
        r"\begin{document}",
        r"\sloppy",
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
    
    import re, os as _os, json

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

    # Pre-build a map: section_id -> list of tables assigned to it
    all_tables = list(document.tables.all().order_by('order', 'created_at'))
    section_tables = {}   # section_id -> [table, ...]
    for t in all_tables:
        if t.section_id:
            section_tables.setdefault(t.section_id, []).append(t)

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

    def emit_table(table):
        """Return a list of LaTeX lines for a single table."""
        label = table.label or f'tab{table.id}'
        caption = table.caption or ''
        try:
            grid = json.loads(table.content)
        except Exception:
            grid = [["Column 1", "Column 2"], ["Data 1", "Data 2"]]
        
        if not isinstance(grid, list) or not grid:
            return []
        
        cols_count = max(len(row) for row in grid) if grid else 0
        if cols_count == 0:
            return []
        
        style = getattr(table, 'style', 'standard')
        
        # 1. Column formatting rules
        if style == 'booktabs' or style == 'no_vertical' or style == 'minimal':
            col_format = "c" * cols_count
        else: # standard
            col_format = "|" + "c|" * cols_count
        
        lines = [
            r"\begin{table}[htbp]",
            r"\centering",
            f"\\caption{{{caption}}}" if caption else "",
            f"\\label{{{label}}}",
            f"\\begin{{tabular}}{{{col_format}}}",
        ]
        
        # 2. Top rule
        if style == 'booktabs' or style == 'minimal':
            lines.append(r"\toprule")
        else:
            lines.append(r"\hline")
        
        # 3. Add rows and horizontal rules
        for i, row in enumerate(grid):
            cells = [str(cell) for cell in row] + [""] * (cols_count - len(row))
            clean_cells = []
            for cell in cells:
                c = cell.replace('&', r'\&').replace('%', r'\%').replace('$', r'\$').replace('_', r'\_').replace('#', r'\#')
                clean_cells.append(c)
            
            row_str = " & ".join(clean_cells) + r" \\"
            
            if i == 0:  # Header row
                if style == 'booktabs':
                    row_str += r" \midrule"
                elif style == 'minimal':
                    pass
                else:  # standard and no_vertical
                    row_str += r" \hline"
            else:  # Data rows
                if i == len(grid) - 1:  # Last row
                    if style == 'booktabs' or style == 'minimal':
                        row_str += r" \bottomrule"
                    else:  # standard and no_vertical
                        row_str += r" \hline"
                else:  # Intermediate rows
                    if style == 'standard':
                        row_str += r" \hline"
                    # booktabs, minimal, no_vertical have no intermediate lines!
            
            lines.append(row_str)
            
        lines.extend([
            r"\end{tabular}",
            r"\end{table}",
            ""
        ])
        return lines

    def process_content_html(content):
        if not content:
            return ""
        # Convert chips back to LaTeX
        text = re.sub(r'<span[^>]*data-type="(ref|cite)"[^>]*data-label="([^"]+)"[^>]*>.*?</span>', r'\\\1{\2}', content)
        
        # Convert simple HTML tags to LaTeX
        text = re.sub(r'<p>(.*?)</p>', r'\1\n\n', text)
        # Remove any existing h3/h4 formatting as we now use real subsections
        text = re.sub(r'<h3>(.*?)</h3>', r'\1\n\n', text)
        text = re.sub(r'<h4>(.*?)</h4>', r'\1\n\n', text)
        text = re.sub(r'<strong>(.*?)</strong>', r'\\textbf{\1}', text)
        text = re.sub(r'<em>(.*?)</em>', r'\\textit{\1}', text)
        text = text.replace('&nbsp;', ' ').replace('&lt;', '<').replace('&gt;', '>')
        return text.strip()

    def emit_section(section, depth=1):
        lines = []
        processed_content = process_content_html(section.content)

        if section.section_type == 'abstract':
            lines.append(r"\begin{abstract}")
            lines.append(processed_content)
            lines.append(r"\end{abstract}")
            if document.index_terms:
                lines.append(r"\begin{IEEEkeywords}")
                lines.append(document.index_terms)
                lines.append(r"\end{IEEEkeywords}")
        elif section.section_type == 'references':
            if not document.references.exists():
                lines.append(r"\section{References}")
                lines.append(processed_content)
        else:
            # Determine heading level
            if depth == 1:
                cmd = "section"
            elif depth == 2:
                cmd = "subsection"
            else:
                cmd = "subsubsection"
            
            lines.append(f"\\{cmd}{{{section.title}}}")
            if processed_content:
                lines.append(processed_content)

        # Emit figures assigned to section
        for img in section_images.get(section.id, []):
            lines.extend(emit_figure(img))

        # Emit tables assigned to section
        for t in section_tables.get(section.id, []):
            lines.extend(emit_table(t))

        # Recursively emit subsections
        subsections = section.subsections.all().order_by('order')
        for sub in subsections:
            lines.extend(emit_section(sub, depth + 1))
            
        return lines

    # Only process top-level sections (where parent is None)
    top_sections = document.sections.filter(parent=None).order_by('order')
    
    for section in top_sections:
        latex_content.extend(emit_section(section, depth=1))

    # Output Bibliography if references exist
    if document.references.exists():
        latex_content.append(r"\bibliographystyle{IEEEtran}")
        latex_content.append(r"\bibliography{refs}")

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

def compile_pdf_online(latex_source, document, cls_source):
    import requests
    import base64
    
    resources = [
        {
            "path": "paper.tex",
            "content": latex_source,
            "main": True
        }
    ]
    
    refs = document.references.all()
    if refs.exists():
        bib_content = ""
        for ref in refs:
            bib_content += ref.bibtex + "\n\n"
        resources.append({
            "path": "refs.bib",
            "content": bib_content
        })
        
    if os.path.exists(cls_source):
        try:
            with open(cls_source, 'r', encoding='utf-8', errors='replace') as f:
                cls_content = f.read()
            resources.append({
                "path": "IEEEtran.cls",
                "content": cls_content
            })
        except Exception as e:
            print("Error reading IEEEtran.cls for online compile:", e)
            
    for img in document.images.all():
        img_disk_path = img.image.path
        if os.path.exists(img_disk_path):
            try:
                with open(img_disk_path, 'rb') as f:
                    img_data = f.read()
                base64_data = base64.b64encode(img_data).decode('utf-8')
                resources.append({
                    "path": os.path.basename(img_disk_path),
                    "file": base64_data
                })
            except Exception as e:
                print(f"Error reading image {img.id} for online compile:", e)
                
    payload = {
        "compiler": "pdflatex",
        "resources": resources
    }
    
    try:
        response = requests.post(
            'https://latex.ytotech.com/builds/sync',
            json=payload,
            headers={'Content-Type': 'application/json'},
            timeout=45
        )
        if response.status_code == 201:
            return response.content
        else:
            print(f"Online compile failed: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        print("Online compile exception:", e)
        return None

@api_view(['GET'])
def export_pdf(request, doc_id):
    """Compile LaTeX to PDF and return it"""
    try:
        document = Document.objects.get(id=doc_id)
        latex_source = generate_latex_source(document)
        
        import tempfile
        import subprocess
        
        cls_source = os.path.join(settings.BASE_DIR.parent, 'ieee_format', 'IEEEtran.cls')
        
        # Try to compile with pdflatex
        try:
            if 'VERCEL' in os.environ:
                raise FileNotFoundError("Force online compile on Vercel")
                
            with tempfile.TemporaryDirectory() as tmpdir:
                # Write LaTeX file
                tex_path = os.path.join(tmpdir, 'paper.tex')
                with open(tex_path, 'w', encoding='utf-8') as f:
                    f.write(latex_source)
                
                # Write BibTeX file if references exist
                refs = document.references.all()
                if refs.exists():
                    bib_path = os.path.join(tmpdir, 'refs.bib')
                    with open(bib_path, 'w', encoding='utf-8') as f:
                        for ref in refs:
                            f.write(ref.bibtex + "\n\n")

                # Copy IEEEtran.cls
                import shutil
                if os.path.exists(cls_source):
                    shutil.copy(cls_source, os.path.join(tmpdir, 'IEEEtran.cls'))

                # Copy uploaded images into tmpdir
                for img in document.images.all():
                    img_disk_path = img.image.path
                    if os.path.exists(img_disk_path):
                        shutil.copy(img_disk_path, os.path.join(tmpdir, os.path.basename(img_disk_path)))
                
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
                
                # Run pdflatex + bibtex + pdflatex twice
                subprocess.run(['pdflatex', '-interaction=nonstopmode', 'paper.tex'], cwd=tmpdir, capture_output=True, timeout=120, env=env)
                
                if refs.exists():
                    subprocess.run(['bibtex', 'paper'], cwd=tmpdir, capture_output=True, timeout=60, env=env)
                    subprocess.run(['pdflatex', '-interaction=nonstopmode', 'paper.tex'], cwd=tmpdir, capture_output=True, timeout=120, env=env)
                
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
                    stdout = result.stdout.decode('utf-8', errors='replace')
                    stderr = result.stderr.decode('utf-8', errors='replace')
                    print(f"PDF compilation failed.\nSTDOUT: {stdout}\nSTDERR: {stderr}")
                    return Response({
                        'error': 'PDF compilation failed', 
                        'log': stderr,
                        'full_log': stdout
                    }, status=500)
                    
        except (FileNotFoundError, OSError):
            print("Local compiler not found, attempting online compilation fallback...")
            pdf_content = compile_pdf_online(latex_source, document, cls_source)
            if pdf_content:
                from django.http import HttpResponse
                response = HttpResponse(pdf_content, content_type='application/pdf')
                response['Content-Disposition'] = f'attachment; filename=paper_{doc_id}.pdf'
                return response
            
            return Response({
                'error': 'LaTeX compilation failed',
                'message': 'Local compiler not found and online fallback compilation failed.'
            }, status=503)
        except subprocess.TimeoutExpired:
            print("Local compiler timed out, attempting online compilation fallback...")
            pdf_content = compile_pdf_online(latex_source, document, cls_source)
            if pdf_content:
                from django.http import HttpResponse
                response = HttpResponse(pdf_content, content_type='application/pdf')
                response['Content-Disposition'] = f'attachment; filename=paper_{doc_id}.pdf'
                return response
            return Response({'error': 'Compilation timeout'}, status=500)
                
    except Document.DoesNotExist:
        return Response({'error': 'Document not found'}, status=404)

@api_view(['GET'])
def export_latex(request, doc_id):
    """Export LaTeX project as ZIP"""
    try:
        document = Document.objects.get(id=doc_id)
        latex_source = generate_latex_source(document)

        import io
        import zipfile
        # Create ZIP in memory
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
            zip_file.writestr(f"paper_{doc_id}.tex", latex_source)
            
            # Write BibTeX if references exist
            refs = document.references.all()
            if refs.exists():
                bib_content = "\n\n".join([ref.bibtex for ref in refs])
                zip_file.writestr("refs.bib", bib_content)
            
            cls_path = os.path.join(settings.BASE_DIR.parent, 'ieee_format', 'IEEEtran.cls')
            if os.path.exists(cls_path):
                zip_file.write(cls_path, 'IEEEtran.cls')
            
            fig_path = os.path.join(settings.BASE_DIR.parent, 'ieee_format', 'fig1.png')
            if os.path.exists(fig_path):
                zip_file.write(fig_path, 'fig1.png')
            
            for img in document.images.all():
                img_disk_path = img.image.path
                if os.path.exists(img_disk_path):
                    zip_file.write(img_disk_path, os.path.basename(img_disk_path))

        from django.http import HttpResponse
        response = HttpResponse(zip_buffer.getvalue(), content_type="application/zip")
        response['Content-Disposition'] = f'attachment; filename=paper_{doc_id}_project.zip'
        return response
        
    except Document.DoesNotExist:
        return Response({'error': 'Document not found'}, status=404)

class PaperTableViewSet(viewsets.ModelViewSet):
    queryset = PaperTable.objects.all()
    serializer_class = PaperTableSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        doc_id = self.request.query_params.get('document')
        if doc_id:
            qs = qs.filter(document=doc_id)
        return qs

class CommentViewSet(viewsets.ModelViewSet):
    queryset = Comment.objects.all()
    serializer_class = CommentSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        doc_id = self.request.query_params.get('document')
        if doc_id:
            qs = qs.filter(document=doc_id)
        return qs

@api_view(['POST'])
def process_ai_equation(request):
    """
    Generate LaTeX equation using Gemini.
    Accepts:
    - description (text) OR
    - image (file)
    """
    description = request.data.get('description')
    image_file = request.FILES.get('image')
    
    try:
        api_key = settings.GEMINI_API_KEY
        if not api_key:
            return Response({'error': 'GEMINI_API_KEY not configured'}, status=500)
            
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel('gemini-2.0-flash')
        
        if image_file:
            img_data = image_file.read()
            mime_type = image_file.content_type
            
            contents = [
                {
                    'mime_type': mime_type,
                    'data': img_data
                },
                "Return only the LaTeX code for the mathematical equation shown in this image. Do not wrap in markdown, code block backticks (like ```), or begin/end document wrappers. Return the equation itself, suitable for inclusion inside a LaTeX equation block (e.g., no \\begin{equation} or $ wrapper, just the core math expression like \\frac{a}{b} = c)."
            ]
            response = model.generate_content(contents)
            latex = response.text.strip()
        elif description:
            prompt = f"""
            Convert the following plain English description of a mathematical equation into a standard LaTeX equation. 
            Return only the raw LaTeX code. Do not wrap in markdown, backticks, or LaTeX document wrappers. 
            Return only the core math expression (e.g. no \\begin{{equation}} or $ wrapper, just the core math expression like \\frac{{a}}{{b}} = c).
            
            Description:
            "{description}"
            """
            response = model.generate_content(prompt)
            latex = response.text.strip()
        else:
            return Response({'error': 'Either description or image is required'}, status=400)
        
        if latex.startswith("```"):
            lines = latex.split('\n')
            if lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].startswith("```"):
                lines = lines[:-1]
            latex = "\n".join(lines).strip()
            
        return Response({'latex': latex})
        
    except Exception as e:
        return Response({'error': str(e)}, status=500)

@api_view(['POST'])
def fetch_doi(request):
    doi = request.data.get('doi', '').strip()
    if not doi:
        return Response({'error': 'DOI is required'}, status=400)
    
    if doi.startswith('http://doi.org/'):
        doi = doi[len('http://doi.org/'):]
    elif doi.startswith('https://doi.org/'):
        doi = doi[len('https://doi.org/'):]
    elif doi.startswith('doi:'):
        doi = doi[len('doi:'):]
    
    import urllib.request
    import urllib.error
    import urllib.parse
    
    url = f"https://doi.org/{urllib.parse.quote(doi)}"
    req = urllib.request.Request(url, headers={'Accept': 'application/x-bibtex'})
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            bibtex = response.read().decode('utf-8')
            return Response({'bibtex': bibtex})
    except urllib.error.HTTPError as e:
        return Response({'error': f"DOI resolver returned error: {e.code}"}, status=400)
    except Exception as e:
        return Response({'error': f"Failed to fetch DOI: {str(e)}"}, status=500)
