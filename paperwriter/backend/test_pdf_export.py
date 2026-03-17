import os
import sys

# Add MiKTeX to PATH
miktex_path = r"C:\Users\DELL\AppData\Local\Programs\MiKTeX\miktex\bin\x64"
if os.path.exists(miktex_path):
    os.environ['PATH'] = miktex_path + os.pathsep + os.environ.get('PATH', '')
    print(f"Added MiKTeX to PATH: {miktex_path}")

# Test pdflatex
import subprocess
try:
    result = subprocess.run(['pdflatex', '--version'], capture_output=True, text=True, timeout=5)
    print(f"\npdflatex found!")
    print(f"Version: {result.stdout.split(chr(10))[0]}")
except FileNotFoundError:
    print("\nERROR: pdflatex not found in PATH")
    sys.exit(1)
except Exception as e:
    print(f"\nERROR: {e}")
    sys.exit(1)

# Test PDF export API
print("\nTesting PDF export API...")
import requests
try:
    response = requests.get('http://localhost:8000/api/document/1/export/pdf', timeout=120)
    print(f"Status Code: {response.status_code}")
    print(f"Content-Type: {response.headers.get('Content-Type')}")
    
    if response.status_code == 200:
        print(f"PDF Size: {len(response.content)} bytes")
        # Save to file
        with open('test_export.pdf', 'wb') as f:
            f.write(response.content)
        print("✓ PDF saved to test_export.pdf")
    else:
        print(f"Error Response: {response.text[:500]}")
except Exception as e:
    print(f"ERROR: {e}")
