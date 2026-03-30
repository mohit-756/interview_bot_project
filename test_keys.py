import os
import requests
import json
from dotenv import load_dotenv

load_dotenv()

def test_key(name, api_key):
    print(f"--- Testing {name} ---")
    if not api_key:
        print("Key missing.")
        return
    url = f"https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key={api_key}"
    # Also try v1beta just in case
    url_beta = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={api_key}"
    
    payload = {"contents": [{"parts": [{"text": "hi"}]}]}
    
    try:
        r = requests.post(url, json=payload, timeout=10)
        print(f"v1 Status: {r.status_code}")
        if r.status_code != 200:
            print(f"v1 Error: {r.text}")
            
        r_beta = requests.post(url_beta, json=payload, timeout=10)
        print(f"v1beta Status: {r_beta.status_code}")
        if r_beta.status_code != 200:
            print(f"v1beta Error: {r_beta.text}")
            
    except Exception as e:
        print(f"Error: {e}")

test_key("PRIMARY", os.getenv("GEMINI_API_KEY"))
test_key("SECONDARY", os.getenv("GEMINI_API_KEY_SECONDARY"))
