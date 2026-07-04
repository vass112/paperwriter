import os
import django
import tempfile
import subprocess
import shutil
os.environ['DJANGO_DEBUG'] = 'True'
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'paperwriter.settings')
django.setup()
from api.models import Document
from api.views import generate_latex_source
from django.conf import settings

doc = Document.objects.first()
latex_source = generate_latex_source(doc)
cls_source = os.path.join(settings.BASE_DIR.parent, 'ieee_format', 'IEEEtran.cls')

with tempfile.TemporaryDirectory() as tmpdir:
    tex_path = os.path.join(tmpdir, 'paper.tex')
    with open(tex_path, 'w', encoding='utf-8') as f:
        f.write(latex_source)

    if os.path.exists(cls_source):
        shutil.copy(cls_source, os.path.join(tmpdir, 'IEEEtran.cls'))

    for img in doc.images.all():
        if img.image_base64:
            img_disk_path = os.path.join(tmpdir, img.filename.replace(" ", "_"))
            import base64
            with open(img_disk_path, 'wb') as f:
                f.write(base64.b64decode(img.image_base64))

    import copy
    env = copy.copy(os.environ)

    miktex_paths = [
        r"C:\Program Files\MiKTeX\miktex\bin\x64",
        r"C:\Users\DELL\AppData\Local\Programs\MiKTeX\miktex\bin\x64",
        os.path.expanduser(r"~\AppData\Local\Programs\MiKTeX\miktex\bin\x64"),
        r"C:\Program Files (x86)\MiKTeX\miktex\bin",
        r"C:\texlive\2024\bin\windows",
        r"C:\texlive\2023\bin\windows",
        r"/usr/bin",
        r"/usr/local/bin",
        r"/Library/TeX/texbin",
        r"/opt/miktex/bin",
    ]

    for miktex_path in miktex_paths:
        if os.path.exists(miktex_path):
            env['PATH'] = miktex_path + os.pathsep + env.get('PATH', '')
            break

    result = subprocess.run(['pdflatex', '-interaction=nonstopmode', 'paper.tex'], cwd=tmpdir, capture_output=True, env=env)
    print("RETURN CODE:", result.returncode)
    if result.returncode != 0:
        print("STDOUT:", result.stdout.decode('utf-8', errors='replace')[-2000:])
        print("STDERR:", result.stderr.decode('utf-8', errors='replace'))
    else:
        print("SUCCESS")
