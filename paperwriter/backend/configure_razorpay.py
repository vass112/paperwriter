import urllib.request
import urllib.error
import json
import sys
import os

token = os.environ.get("VERCEL_TOKEN", "vcp_your_vercel_token_here")
project_id = "prj_Abmw9sSfkyzBPH48GueT8Bqx0OGk"
team_id = "team_vR0i0hsJSrOdNzgrORQf6C0v"

def main():
    # 1. Locate and parse rzp-key.csv
    csv_path = None
    for p in ["../../rzp-key.csv", "../rzp-key.csv", "rzp-key.csv"]:
        if os.path.exists(p):
            csv_path = p
            break
            
    if not csv_path:
        print("Error: rzp-key.csv file not found!")
        sys.exit(1)
        
    key_id = None
    key_secret = None
    with open(csv_path, 'r', encoding='utf-8') as f:
        lines = [l.strip() for l in f.readlines() if l.strip()]
        if len(lines) >= 2:
            parts = lines[1].split(',')
            if len(parts) >= 2:
                key_id = parts[0].strip()
                key_secret = parts[1].strip()

    if not key_id or not key_secret:
        print("Error: Could not parse key_id and key_secret from CSV!")
        sys.exit(1)

    print(f"Read Razorpay Key ID: {key_id}")
    
    # 2. Update local .env
    env_path = ".env"
    lines = []
    if os.path.exists(env_path):
        with open(env_path, 'r', encoding='utf-8') as f:
            lines = f.readlines()
            
    vars_to_set = {
        "RAZORPAY_KEY_ID": key_id,
        "RAZORPAY_KEY_SECRET": key_secret,
        "RAZORPAY_PAGE_ID": "rzp/rYgUBTx3"
    }
    
    new_lines = []
    set_keys = set()
    for line in lines:
        stripped = line.strip()
        matched = False
        for var_name, var_val in vars_to_set.items():
            if stripped.startswith(f"{var_name}="):
                new_lines.append(f'{var_name}="{var_val}"\n')
                set_keys.add(var_name)
                matched = True
                break
        if not matched:
            new_lines.append(line)
            
    for var_name, var_val in vars_to_set.items():
        if var_name not in set_keys:
            if new_lines and not new_lines[-1].endswith('\n'):
                new_lines[-1] += '\n'
            new_lines.append(f'{var_name}="{var_val}"\n')
            
    with open(env_path, 'w', encoding='utf-8') as f:
        f.writelines(new_lines)
    print("Saved Razorpay credentials successfully to local .env file!")

    # 3. Synchronize with Vercel if VERCEL_TOKEN is set
    if not token or token == "vcp_your_vercel_token_here":
        print("\n[INFO] VERCEL_TOKEN environment variable is not set.")
        print("Please configure the following environment variables in your Vercel Dashboard manually:")
        for k, v in vars_to_set.items():
            print(f"  {k} = {v}")
        return

    print("\nSynchronizing Razorpay credentials with Vercel...")
    for var_name, var_val in vars_to_set.items():
        # Check existing and delete
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
                existing = [e for e in data.get("envs", []) if e.get("key") == var_name]
                if existing:
                    env_id = existing[0]["id"]
                    print(f"Found existing {var_name} (ID: {env_id}) on Vercel, deleting...")
                    del_url = f"https://api.vercel.com/v9/projects/{project_id}/env/{env_id}?teamId={team_id}"
                    del_req = urllib.request.Request(
                        del_url,
                        headers={"Authorization": f"Bearer {token}"},
                        method="DELETE"
                    )
                    with urllib.request.urlopen(del_req) as del_resp:
                        pass
        except Exception as e:
            print(f"Error checking/deleting existing {var_name} on Vercel: {e}")

        # Add new variable
        add_url = f"https://api.vercel.com/v8/projects/{project_id}/env?teamId={team_id}"
        add_data = {
            "key": var_name,
            "value": var_val,
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
                print(f"Successfully set {var_name} on Vercel!")
        except urllib.error.HTTPError as e:
            print(f"Failed to set {var_name} on Vercel: {e.code} - {e.read().decode('utf-8')}")
        except Exception as e:
            print(f"Failed to connect to Vercel API: {e}")

if __name__ == "__main__":
    main()
