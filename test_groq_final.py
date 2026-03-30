import os
import requests
import json
from dotenv import load_dotenv

load_dotenv()

def test_groq_generation(api_key, model):
    print(f"Testing Groq generation with model: {model}...")
    url = "https://api.groq.com/openai/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": "You are a technical interviewer. Return ONLY valid JSON."},
            {"role": "user", "content": "Generate one interview question about Python for a junior dev in JSON format with keys: text, difficulty."}
        ],
        "temperature": 0.7,
        "response_format": {"type": "json_object"}
    }
    try:
        response = requests.post(url, json=payload, headers=headers, timeout=30)
        print(f"Status: {response.status_code}")
        if response.status_code == 200:
            print("Success! Groq response received.")
            print(json.dumps(response.json(), indent=2))
        else:
            print(f"Error: {response.text}")
    except Exception as e:
        print(f"Connection Error: {e}")

api_key = os.getenv("GROQ_API_KEY")
model = os.getenv("LLM_STANDARD_MODEL", "llama-3.1-8b-instant")

if api_key:
    test_groq_generation(api_key, model)
else:
    print("No GROQ_API_KEY found in .env")
