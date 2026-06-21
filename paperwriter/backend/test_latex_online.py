import requests
import os

# Let's read IEEEtran.cls if it exists
cls_path = '../ieee_format/IEEEtran.cls'
cls_content = ""
if os.path.exists(cls_path):
    with open(cls_path, 'r', encoding='utf-8', errors='replace') as f:
        cls_content = f.read()

payload = {
    "compiler": "pdflatex",
    "resources": [
        {
            "path": "paper.tex",
            "content": r"""\documentclass[conference]{IEEEtran}
\begin{document}
\title{Test Document}
\author{\IEEEauthorblockN{Jane Doe}
\IEEEauthorblockA{University of Test}}
\maketitle
\begin{abstract}
This is a test of the online LaTeX compiler.
\end{abstract}
Hello World!
\end{document}""",
            "main": True
        }
    ]
}

if cls_content:
    payload["resources"].append({
        "path": "IEEEtran.cls",
        "content": cls_content
    })

try:
    r = requests.post('https://latex.ytotech.com/builds/sync', json=payload, timeout=30)
    print("STATUS:", r.status_code)
    if r.status_code == 201:
        print("Success! PDF size:", len(r.content))
    else:
        print("Error details:", r.text[:500])
except Exception as e:
    print("Exception occurred:", e)
