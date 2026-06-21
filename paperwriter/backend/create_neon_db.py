import urllib.request
import urllib.error
import json
import sys
import os

API_KEY = os.environ.get("NEON_API_KEY", "your_neon_api_key_here")

def request_neon(endpoint, data=None, method="GET"):
    url = f"https://console.neon.tech/api/v2{endpoint}"
    req = urllib.request.Request(
        url,
        data=json.dumps(data).encode('utf-8') if data else None,
        headers={
            "Authorization": f"Bearer {API_KEY}",
            "Accept": "application/json",
            "Content-Type": "application/json"
        },
        method=method
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            return json.loads(response.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        print(f"HTTP Error {e.code}: {e.read().decode('utf-8')}")
        sys.exit(1)
    except Exception as e:
        print(f"Error connecting to Neon API: {e}")
        sys.exit(1)

def main():
    print("Connecting to Neon API...")
    
    # 1. Check existing projects
    projects_data = request_neon("/projects")
    projects = projects_data.get("projects", [])
    
    project_id = None
    connection_uri = None
    
    if projects:
        # Reuse existing project
        proj = projects[0]
        project_id = proj["id"]
        print(f"Found existing Neon project: {proj['name']} (ID: {project_id})")
    else:
        # Create a new project
        print("Creating a new Neon project...")
        payload = {
            "project": {
                "name": "paperwriter"
            }
        }
        res = request_neon("/projects", data=payload, method="POST")
        proj = res.get("project")
        if not proj:
            print("Failed to parse project creation response.")
            sys.exit(1)
        project_id = proj["id"]
        print(f"Successfully created new Neon project: {proj['name']} (ID: {project_id})")

    # 2. Fetch connection details / URI
    connection_data = request_neon(f"/projects/{project_id}/connection_uri")
    connection_uri = connection_data.get("connection_uri")
    
    if not connection_uri:
        print("Connection URI not returned directly, fetching roles and branches...")
        roles_data = request_neon(f"/projects/{project_id}/branches")
        branches = roles_data.get("branches", [])
        if not branches:
            print("No branches found.")
            sys.exit(1)
        branch_id = branches[0]["id"]
        
        conn_info = request_neon(f"/projects/{project_id}/branches/{branch_id}/connection_uri")
        connection_uri = conn_info.get("connection_uri")

    if not connection_uri:
        print("Failed to retrieve Connection URI from Neon API.")
        sys.exit(1)

    # Convert connection_uri to standard postgresql:// format if needed
    if connection_uri.startswith("postgres://"):
        connection_uri = "postgresql://" + connection_uri[len("postgres://"):]
        
    print(f"\n[NEON DATABASE CONFIGURATION SUCCESSFUL]")
    print(f"DATABASE_URL: {connection_uri}")
    
    # 3. Save to local .env file
    env_path = ".env"
    
    lines = []
    if os.path.exists(env_path):
        with open(env_path, 'r', encoding='utf-8') as f:
            lines = f.readlines()
            
    updated = False
    new_lines = []
    for line in lines:
        if line.strip().startswith("DATABASE_URL="):
            new_lines.append(f"DATABASE_URL={connection_uri}\n")
            updated = True
        else:
            new_lines.append(line)
            
    if not updated:
        new_lines.append(f"DATABASE_URL={connection_uri}\n")
        
    with open(env_path, 'w', encoding='utf-8') as f:
        f.writelines(new_lines)
        
    print("Saved DATABASE_URL successfully to local .env file!")
    print("\nCopy the DATABASE_URL printed above and add it as an Environment Variable on Vercel.")

if __name__ == "__main__":
    main()
