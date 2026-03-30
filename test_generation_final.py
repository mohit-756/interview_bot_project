import os
import requests
import json
from dotenv import load_dotenv

load_dotenv()

def test_generation(api_key, model):
    print(f"Testing generation with model: {model} and key: {api_key[:10]}...")
    url = f"https://generativelanguage.googleapis.com/v1/models/{model}:generateContent?key={api_key}"
    payload = {
        "contents": [{"parts": [{"text": "Generate a simple interview question about Python decorators."}]}],
        "generationConfig": {
            "temperature": 0.7,
            "maxOutputTokens": 200,
            "responseMimeType": "application/json"
        }
    }
    try:
        response = requests.post(url, json=payload, timeout=30)
        print(f"Status: {response.status_code}")
        if response.status_code == 200:
            print("Success! Response received.")
            # print(json.dumps(response.json(), indent=2))
        else:
            print(f"Error: {response.text}")
    except Exception as e:
        print(f"Connection Error: {e}")

api_key = os.getenv("GEMINI_API_KEY")
model = os.getenv("LLM_STANDARD_MODEL", "gemini-2.0-flash")

if api_key:
    test_generation(api_key, model)
else:
    print("No GEMINI_API_KEY found in .env")
