import urllib.request
import urllib.error
import json
import sys
import os

token = os.environ.get("VERCEL_TOKEN", "vcp_your_vercel_token_here")
project_id = "prj_Abmw9sSfkyzBPH48GueT8Bqx0OGk"
team_id = "team_vR0i0hsJSrOdNzgrORQf6C0v"

def get_env_value():
    if not os.path.exists(".env"):
        print("Local .env file not found. Run create_neon_db.py first!")
        sys.exit(1)
        
    db_url = None
    with open(".env", "r", encoding="utf-8") as f:
        for line in f:
            if line.strip().startswith("DATABASE_URL="):
                db_url = line.strip().split("=", 1)[1]
                break
                
    if not db_url:
        print("DATABASE_URL not found in .env. Run create_neon_db.py first!")
        sys.exit(1)
        
    return db_url

def main():
    db_url = get_env_value()
    print(f"Setting DATABASE_URL on Vercel...")
    
    # 1. Check existing env vars to find and delete existing DATABASE_URL
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
            existing = [e for e in data.get("envs", []) if e.get("key") == "DATABASE_URL"]
            if existing:
                env_id = existing[0]["id"]
                print(f"Found existing DATABASE_URL (ID: {env_id}), deleting...")
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
        
    # 2. Add DATABASE_URL to Vercel
    add_url = f"https://api.vercel.com/v8/projects/{project_id}/env?teamId={team_id}"
    add_data = {
        "key": "DATABASE_URL",
        "value": db_url,
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
            print("Successfully set DATABASE_URL on Vercel!")
    except urllib.error.HTTPError as e:
        print(f"Failed to set Vercel env var: {e.code} - {e.read().decode('utf-8')}")
        sys.exit(1)
    except Exception as e:
        print(f"Failed to connect to Vercel API: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
