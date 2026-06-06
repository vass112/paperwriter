import re

with open(r'c:\Users\DELL\Desktop\paperwriter\paperwriter\backend\templates\index.html', 'r', encoding='utf-8') as f:
    html = f.read()

html = html.replace('border-radius: 4px;', 'border-radius: 12px; font-family: inherit; box-sizing: border-box;')
html = html.replace('border-radius: 8px;', 'border-radius: 14px; box-sizing: border-box;')
html = html.replace('class="modal-content"\n            style="max-width: 900px;', 'class="modal-content"\n            style="border-radius: 20px; max-width: 900px;')
html = html.replace('class="modal-content"\n            style="max-width: 950px;', 'class="modal-content"\n            style="border-radius: 20px; max-width: 950px;')
html = html.replace('border-radius: 10px;', 'border-radius: 16px;')
html = html.replace('style="width: 100%; padding: 8px;', 'style="width: 100%; padding: 10px 14px;')

with open(r'c:\Users\DELL\Desktop\paperwriter\paperwriter\backend\templates\index.html', 'w', encoding='utf-8') as f:
    f.write(html)
print("UI styling replaced successfully.")
