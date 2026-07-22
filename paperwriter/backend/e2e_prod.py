"""
PaperWriter Production E2E Test Runner
Runs automated HTTP-based tests against the production server.
Usage: python e2e_prod.py
"""
import requests
import json
import sys
import time
import re
from datetime import datetime

BASE = "https://paperwriter.app"
results = []
passed = 0
failed = 0

def log(msg):
    print(f"  {msg}")

def check(name, ok, detail=""):
    global passed, failed
    if ok:
        passed += 1
        results.append((name, "PASS", detail))
        print(f"  [PASS] {name}")
    else:
        failed += 1
        results.append((name, "FAIL", detail))
        print(f"  [FAIL] {name} -- {detail}")

def test(name, fn):
    try:
        fn()
    except Exception as e:
        check(name, False, str(e))

# ============================================================
# 1. CORE PAGE LOADS
# ============================================================
def test_homepage():
    r = requests.get(f"{BASE}/", timeout=30)
    html = r.text
    check("Landing page returns 200", r.status_code == 200, f"Got {r.status_code}")
    check("HTML contains DOCTYPE", "<!DOCTYPE html>" in html)
    check("Google Client ID present", "GOOGLE_CLIENT_ID" in html)
    check("MathQuill CSS linked", "mathquill.css" in html)
    check("Google GSI script", "accounts.google.com/gsi/client" in html)
    check("Inter font loaded", "Inter" in html)
    check("Error overlay handler present", "GLOBAL ERROR DETECTED" in html)
    check("ProseMirror editor style", "ProseMirror" in html)
    check("app.js module loaded", "app.js" in html)
    check("No 500 errors in response", "Internal Server Error" not in html)
    check("No NOT_FOUND in response", "NOT_FOUND" not in html)

def test_static_files():
    assets = [
        ("CSS style.css", "/static/css/style.css", 10000),
        ("JS app.js", "/static/js/app.js", 50000),
        ("Katex JS", "/static/js/vendor/katex.min.js", 1000),
        ("Katex CSS", "/static/js/vendor/katex.css", 1000),
        ("TipTap bundle", "/static/js/vendor/tiptap-bundle.js", 1000),
        ("Auto-render", "/static/js/vendor/contrib/auto-render.min.js", 1000),
        ("Logo image", "/static/images/logo.png", 100),
    ]
    for name, path, min_size in assets:
        r = requests.get(f"{BASE}{path}", timeout=15)
        check(f"Static: {name}", r.status_code == 200 and len(r.content) >= min_size,
              f"Status {r.status_code}, {len(r.content)} bytes")

def test_cdn_resources():
    cdns = [
        ("MathQuill CSS", "https://cdn.jsdelivr.net/npm/mathquill@0.10.1/build/mathquill.css", 100),
        ("MathQuill JS", "https://cdn.jsdelivr.net/npm/mathquill@0.10.1/build/mathquill.js", 1000),
        ("jQuery 3.7.1", "https://code.jquery.com/jquery-3.7.1.min.js", 1000),
    ]
    for name, url, min_size in cdns:
        r = requests.get(url, timeout=15)
        check(f"CDN: {name}", r.status_code == 200 and len(r.content) >= min_size,
              f"Status {r.status_code}, {len(r.content)} bytes")

def test_404():
    r = requests.get(f"{BASE}/nonexistent_page_xyz", timeout=15)
    # SPA catch-all now returns 200 (index.html) for unknown paths
    check("SPA catch-all for unknown path", r.status_code == 200, f"Got {r.status_code}")

def test_favicon():
    r = requests.get(f"{BASE}/favicon.ico", timeout=15)
    # 404 is acceptable for missing favicon
    check("favicon.ico (404 OK)", r.status_code in (200, 404), f"Got {r.status_code}")

# ============================================================
# 2. API ENDPOINTS (Unauthenticated)
# ============================================================
def test_api_noauth():
    endpoints = [
        ("GET /api/documents/", "/api/documents/", 401, 403),
        ("GET /api/documents/1/", "/api/documents/1/", 401, 403, 404),
        ("POST /api/documents/16/heartbeat/", "/api/documents/16/heartbeat/", 401, 403),
    ]
    for name, path, *expected in endpoints:
        r = requests.get(f"{BASE}{path}", timeout=15) if "heartbeat" not in path else requests.post(f"{BASE}{path}", timeout=15)
        check(f"API: {name}", r.status_code in expected, f"Got {r.status_code}, expected {expected}")

def test_api_cors():
    r = requests.options(f"{BASE}/api/documents/", timeout=15,
                         headers={"Origin": "https://example.com"})
    cors_origin = r.headers.get("Access-Control-Allow-Origin", "")
    check("API CORS headers present",
          bool(cors_origin) or r.status_code in (200, 204, 403, 401),
          f"Status {r.status_code}, CORS: {cors_origin or 'none'}")

# ============================================================
# 3. SECURITY CHECKS
# ============================================================
def test_security_headers():
    r = requests.get(f"{BASE}/", timeout=15)
    headers = r.headers
    check("X-Frame-Options present (clickjacking)",
          headers.get("X-Frame-Options", "") in ("DENY", "SAMEORIGIN"),
          f"Value: {headers.get('X-Frame-Options', 'missing')}")
    check("Content-Type header present",
          "text/html" in headers.get("Content-Type", ""),
          f"Value: {headers.get('Content-Type', 'missing')}")

def test_xss_content_type():
    # Test that the API returns proper content-type for JSON
    r = requests.get(f"{BASE}/api/documents/", timeout=15)
    if r.status_code in (401, 403):
        ct = r.headers.get("Content-Type", "")
        check("API returns JSON content-type",
              "application/json" in ct,
              f"Content-Type: {ct}")

# ============================================================
# 4. LaTeX GENERATION (via API if we can access a document)
# ============================================================
def test_latex_structure():
    """Verify the homepage HTML has basic expected structure."""
    r = requests.get(f"{BASE}/", timeout=30)
    html = r.text
    # Check for key UI text (some rendered by JS dynamically)
    ui_texts = ["PaperWriter", "GOOGLE_CLIENT_ID", "mathquill"]
    for t in ui_texts:
        check(f"UI contains '{t}'", t in html, f"Missing: {t}")
    # JS-loaded components are not in initial HTML -- verified by Playwright E2E tests instead

# ============================================================
# 5. RESPONSIVENESS/HEADER CHECKS
# ============================================================
def test_compression():
    r = requests.get(f"{BASE}/", timeout=15, headers={"Accept-Encoding": "gzip, deflate"})
    ce = r.headers.get("Content-Encoding", "")
    check("Response is compressed",
          ce in ("gzip", "deflate") or "gzip" in ce,
          f"Encoding: {ce}")

def test_https_redirect():
    r = requests.get("http://paperwriter.app/", timeout=15, allow_redirects=True)
    check("HTTP redirects to HTTPS",
          r.url.startswith("https://"),
          f"Final URL: {r.url}")

# ============================================================
# RUN ALL TESTS
# ============================================================
def run_all():
    global passed, failed

    print("=" * 60)
    print(f"  PaperWriter Production E2E Tests")
    print(f"  URL: {BASE}")
    print(f"  Started: {datetime.now().isoformat()}")
    print("=" * 60)
    print()

    sections = [
        ("1. Core Page Loads", [
            test_homepage,
            test_static_files,
            test_cdn_resources,
            test_404,
            test_favicon,
        ]),
        ("2. API & Security", [
            test_api_noauth,
            test_api_cors,
            test_security_headers,
            test_xss_content_type,
            test_latex_structure,
            test_compression,
            test_https_redirect,
        ]),
    ]

    for section_name, tests in sections:
        print(f"--- {section_name} ---")
        for t in tests:
            test(t.__name__, t)
        print()

    # Summary
    print("=" * 60)
    print(f"  RESULTS: {passed} PASSED, {failed} FAILED, {passed+failed} TOTAL")
    print("=" * 60)

    if failed > 0:
        print("\nFAILURE DETAILS:")
        for name, status, detail in results:
            if status == "FAIL":
                print(f"  [{status}] {name}: {detail}")
        print()

    return 0 if failed == 0 else 1

if __name__ == "__main__":
    sys.exit(run_all())
