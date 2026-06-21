import urllib.request
import urllib.error
import json
import sys
import os

token = os.environ.get("VERCEL_TOKEN", "vcp_your_vercel_token_here")
project_id = "prj_Abmw9sSfkyzBPH48GueT8Bqx0OGk"
team_id = "team_vR0i0hsJSrOdNzgrORQf6C0v"
google_id = "370497417018-lpupjt1o43o74emk0eoij0emcvmh0k09.apps.googleusercontent.com"

def main():
    # 1. Save locally in .env
    env_path = ".env"
    lines = []
    if os.path.exists(env_path):
        with open(env_path, 'r', encoding='utf-8') as f:
            lines = f.readlines()
            
    updated = False
    new_lines = []
    for line in lines:
        if line.strip().startswith("GOOGLE_CLIENT_ID="):
            new_lines.append(f"GOOGLE_CLIENT_ID={google_id}\n")
            updated = True
        else:
            new_lines.append(line)
            
    if not updated:
        new_lines.append(f"GOOGLE_CLIENT_ID={google_id}\n")
        
    with open(env_path, 'w', encoding='utf-8') as f:
        f.writelines(new_lines)
    print("Saved GOOGLE_CLIENT_ID successfully to local .env file!")

    # 2. Add to Vercel
    print("Setting GOOGLE_CLIENT_ID on Vercel...")
    
    # Check existing env vars to find and delete existing GOOGLE_CLIENT_ID
    url = f"https://api.vercel.com/v9/projects/{project_id}/env?teamId={team_id}"
    req = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/json"
        }
    )
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            existing = [e for e in data.get("envs", []) if e.get("key") == "GOOGLE_CLIENT_ID"]
            if existing:
                env_id = existing[0]["id"]
                print(f"Found existing GOOGLE_CLIENT_ID (ID: {env_id}), deleting...")
                del_url = f"https://api.vercel.com/v9/projects/{project_id}/env/{env_id}?teamId={team_id}"
                del_req = urllib.request.Request(
                    del_url,
                    headers={"Authorization": f"Bearer {token}"},
                    method="DELETE"
                )
                with urllib.request.urlopen(del_req) as del_resp:
                    pass
    except Exception as e:
        print(f"Error checking/deleting existing Vercel env var: {e}")
        
    # Add GOOGLE_CLIENT_ID to Vercel
    add_url = f"https://api.vercel.com/v8/projects/{project_id}/env?teamId={team_id}"
    add_data = {
        "key": "GOOGLE_CLIENT_ID",
        "value": google_id,
        "type": "plain",
        "target": ["production", "preview", "development"]
    }
    add_req = urllib.request.Request(
        add_url,
        data=json.dumps(add_data).encode('utf-8'),
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        },
        method="POST"
    )
    try:
        with urllib.request.urlopen(add_req) as resp:
            print("Successfully set GOOGLE_CLIENT_ID on Vercel!")
    except urllib.error.HTTPError as e:
        print(f"Failed to set Vercel env var: {e.code} - {e.read().decode('utf-8')}")
        sys.exit(1)
    except Exception as e:
        print(f"Failed to connect to Vercel API: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
