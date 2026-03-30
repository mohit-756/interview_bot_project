import requests, os
from dotenv import load_dotenv
load_dotenv(override=True)
key = os.getenv('GROQ_API_KEY')
payload = {
    "model": "llama-3.1-8b-instant",
    "messages": [{"role": "user", "content": "Generate one Python interview question as JSON with keys: question, difficulty"}],
    "max_tokens": 100,
    "response_format": {"type": "json_object"}
}
r = requests.post(
    'https://api.groq.com/openai/v1/chat/completions',
    headers={'Authorization': f'Bearer {key}', 'Content-Type': 'application/json'},
    json=payload,
    timeout=15
)
print(f'Status: {r.status_code}')
if r.status_code == 200:
    print('SUCCESS! Groq + Llama 3.1 is working!')
    print(r.json()['choices'][0]['message']['content'])
else:
    print(r.text[:500])
