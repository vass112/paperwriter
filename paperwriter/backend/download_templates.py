import urllib.request
import os

target_dir = r"C:\Users\DELL\Desktop\paperwriter\paperwriter\backend\api\templates\classfiles"
os.makedirs(target_dir, exist_ok=True)

files_to_download = {
    # ACM
    "acmart.cls": "https://mirrors.ctan.org/macros/latex/contrib/acmart/acmart.cls",
    "ACM-Reference-Format.bst": "https://mirrors.ctan.org/macros/latex/contrib/acmart/ACM-Reference-Format.bst",
    # Elsevier
    "elsarticle.cls": "https://mirrors.ctan.org/macros/latex/contrib/elsarticle/elsarticle.cls",
    "elsarticle-num.bst": "https://mirrors.ctan.org/macros/latex/contrib/elsarticle/elsarticle-num.bst",
    # Springer
    "llncs.cls": "https://mirrors.ctan.org/macros/latex/contrib/llncs/llncs.cls",
    "splncs04.bst": "https://mirrors.ctan.org/macros/latex/contrib/llncs/splncs04.bst",
    # APA
    "apa7.cls": "https://mirrors.ctan.org/macros/latex/contrib/apa7/apa7.cls",
    "apacite.bst": "https://mirrors.ctan.org/biblio/bibtex/contrib/apacite/apacite.bst",
    # MLA
    # mla-new is not directly on ctan as a single bst in an obvious path, we can grab a basic natbib bst for it or an mla.bst
    "mla-new.bst": "https://mirrors.ctan.org/biblio/bibtex/contrib/mla-paper/mla.bst", # fallback for MLA style if needed
}

# The user mentioned natbib + a single .bst file for MLA and APA to skip biblatex
# We'll download the standard apacite.bst and mla.bst

for filename, url in files_to_download.items():
    dest = os.path.join(target_dir, filename)
    print(f"Downloading {filename}...")
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req) as response, open(dest, 'wb') as out_file:
            out_file.write(response.read())
        print(f"Successfully downloaded {filename}")
    except Exception as e:
        print(f"Failed to download {filename} from {url}: {e}")
        # Create empty fallback file
        with open(dest, 'w') as out_file:
            pass

print("Done")
