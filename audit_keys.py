import os
import requests
import json
from dotenv import load_dotenv

load_dotenv()

def audit_key(name, api_key):
    print(f"--- Auditing {name} ---")
    if not api_key:
        print("Key missing.")
        return
        
    # 1. Simple model list to check key validity
    list_url = f"https://generativelanguage.googleapis.com/v1/models?key={api_key}"
    try:
        r = requests.get(list_url, timeout=10)
        if r.status_code == 200:
            models = r.json().get("models", [])
            print(f"Key is VALID. Found {len(models)} models.")
            # Print a few common ones
            for m in models:
                if "gemini" in m.get("name", ""):
                    print(f" - {m.get('name')}")
        else:
            print(f"Key is INVALID ({r.status_code}): {r.text}")
    except Exception as e:
        print(f"Error auditing {name}: {e}")

audit_key("PRIMARY", os.getenv("GEMINI_API_KEY"))
audit_key("SECONDARY", os.getenv("GEMINI_API_KEY_SECONDARY"))
