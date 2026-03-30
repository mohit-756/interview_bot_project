import os
import requests
import json
from dotenv import load_dotenv

load_dotenv()

def list_gemini_models(api_key):
    print(f"Listing Gemini Models with key: {api_key[:10]}...")
    url = f"https://generativelanguage.googleapis.com/v1/models?key={api_key}"
    try:
        response = requests.get(url, timeout=30)
        print(f"Status Code: {response.status_code}")
        if response.status_code == 200:
            models = response.json().get("models", [])
            for m in models:
                print(f" - {m.get('name')}")
        else:
            print("Error Response:", response.text)
    except Exception as e:
        print(f"Connection Error: {e}")

api_key = os.getenv("GEMINI_API_KEY")
if api_key:
    list_gemini_models(api_key)
