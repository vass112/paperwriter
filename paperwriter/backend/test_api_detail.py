
import requests
try:
    response = requests.get('http://127.0.0.1:8000/api/documents/1/')
    print(f"Status Code: {response.status_code}")
    print(f"Content: {response.text}")
except Exception as e:
    print(f"Error: {e}")
