import os
import requests
import json
from dotenv import load_dotenv

load_dotenv()

def test_v1_simple(api_key, model):
    print(f"Testing v1 simple with model: {model}")
    url = f"https://generativelanguage.googleapis.com/v1/models/{model}:generateContent?key={api_key}"
    payload = {
        "contents": [{"parts": [{"text": "hi"}]}]
    }
    try:
        r = requests.post(url, json=payload, timeout=10)
        print(f"Status: {r.status_code}")
        print(f"Response: {r.text}")
    except Exception as e:
        print(f"Error: {e}")

api_key = os.getenv("GEMINI_API_KEY")
model = os.getenv("LLM_STANDARD_MODEL", "gemini-2.0-flash")
if api_key:
    test_v1_simple(api_key, model)
