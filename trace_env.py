import os
from dotenv import load_dotenv, find_dotenv

dotenv_path = find_dotenv()
print(f"Loading .env from: {dotenv_path}")
load_dotenv(dotenv_path)

key = os.getenv("GROQ_API_KEY")
if key:
    print(f"Key found. Length: {len(key)}")
    print(f"Starts with: {key[:10]}...")
    print(f"Ends with: ...{key[-5:]}")
else:
    print("GROQ_API_KEY NOT FOUND in environment.")
