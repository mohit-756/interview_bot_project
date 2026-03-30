import os
import requests
import json
from dotenv import load_dotenv

load_dotenv()

def test_generation_v1beta(api_key, model):
    print(f"Testing generation with model: {model} and key: {api_key[:10]}... (v1beta)")
    # Using v1beta as some 2.0/2.5 features/models prefer it in REST
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
    payload = {
        "contents": [{"parts": [{"text": "hi"}]}],
        "generationConfig": {
            "temperature": 0.7,
            "maxOutputTokens": 200,
        }
    }
    try:
        response = requests.post(url, json=payload, timeout=30)
        print(f"Status: {response.status_code}")
        if response.status_code == 200:
            print("Success!")
        else:
            print(f"Error: {response.text}")
    except Exception as e:
        print(f"Error: {e}")

api_key = os.getenv("GEMINI_API_KEY")
model = os.getenv("LLM_STANDARD_MODEL", "gemini-2.0-flash")

if api_key:
    test_generation_v1beta(api_key, model)
