import os
import requests
import json
from dotenv import load_dotenv

load_dotenv()

def test_gemini_api(api_key, model="gemini-1.5-flash"):
    print(f"Testing Gemini API with key: {api_key[:10]}...")
    url = f"https://generativelanguage.googleapis.com/v1/models/{model}:generateContent?key={api_key}"
    payload = {
        "contents": [{"parts": [{"text": "Hello, are you working?"}]}],
        "generationConfig": {
            "temperature": 0.2,
            "maxOutputTokens": 100,
        }
    }
    try:
        response = requests.post(url, json=payload, timeout=30)
        print(f"Status Code: {response.status_code}")
        if response.status_code == 200:
            print("Response:", json.dumps(response.json(), indent=2))
        else:
            print("Error Response:", response.text)
    except Exception as e:
        print(f"Connection Error: {e}")

api_key = os.getenv("GEMINI_API_KEY")
api_key_secondary = os.getenv("GEMINI_API_KEY_SECONDARY")

if api_key:
    test_gemini_api(api_key)
if api_key_secondary:
    test_gemini_api(api_key_secondary)
