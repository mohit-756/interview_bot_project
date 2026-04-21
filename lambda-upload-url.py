"""
AWS Lambda for interview bot:
1. Generate presigned S3 upload URLs (existing)
2. Polly TTS synthesis (new)
"""

import json
import uuid
import boto3
import os

s3 = boto3.client("s3")
polly = boto3.client("polly")

BUCKET_NAME = os.environ.get("BUCKET_NAME", "interview-bot-uploads")
REGION = os.environ.get("REGION", "ap-south-1")

POLLY_VOICES = {
    "kajal": {"voice_id": "Kajal", "engine": "neural", "lang": "en-IN"},
}

ALLOWED_VOICES = list(POLLY_VOICES.keys())


def lambda_handler(event, context):
    method = event.get("httpMethod", "")
    path = event.get("path", "/")

    if method == "OPTIONS":
        return {
            "statusCode": 200,
            "headers": {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "Content-Type,Authorization,Accept",
                "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
                "Access-Control-Max-Age": "3600"
            },
            "body": ""
        }

    params = event.get("queryStringParameters") or {}

    if path.startswith("/tts") or params.get("text"):
        return handle_tts(params)
    else:
        return handle_upload(params)


def handle_upload(params):
    """Generate presigned S3 upload URL (existing functionality)."""
    file_name = params.get("fileName", "")
    file_type = params.get("fileType", "")

    if not file_name or not file_type:
        return {
            "statusCode": 400,
            "headers": {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "Content-Type,Authorization,Accept"
            },
            "body": json.dumps({"error": "Missing fileName or fileType"})
        }

    unique_key = f"{uuid.uuid4()}_{file_name}"

    try:
        url = s3.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": BUCKET_NAME,
                "Key": unique_key,
                "ContentType": file_type
            },
            ExpiresIn=600
        )
    except Exception as e:
        return {
            "statusCode": 500,
            "headers": {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "Content-Type,Authorization,Accept"
            },
            "body": json.dumps({"error": str(e)})
        }

    public_url = f"https://{BUCKET_NAME}.s3.{REGION}.amazonaws.com/{unique_key}"

    return {
        "statusCode": 200,
        "headers": {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type,Authorization,Accept",
            "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
            "Access-Control-Max-Age": "3600"
        },
        "body": json.dumps({
            "uploadUrl": url,
            "fileUrl": public_url
        })
    }


def handle_tts(params):
    """Synthesize speech using Amazon Polly (new functionality)."""
    text = params.get("text", "")
    voice = params.get("voice", "kajal")

    if not text:
        return {
            "statusCode": 400,
            "headers": {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "Content-Type,Authorization,Accept"
            },
            "body": json.dumps({"error": "Text is required"})
        }

    if voice not in ALLOWED_VOICES:
        return {
            "statusCode": 400,
            "headers": {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "Content-Type,Authorization,Accept"
            },
            "body": json.dumps({"error": f"Invalid voice. Allowed: {ALLOWED_VOICES}"})
        }

    voice_config = POLLY_VOICES[voice]

    try:
        synthesize_response = polly.synthesize_speech(
            Text=text,
            OutputFormat="mp3",
            VoiceId=voice_config["voice_id"],
            Engine=voice_config["engine"],
            LanguageCode=voice_config["lang"]
        )

        audio_stream = synthesize_response.get("AudioStream")
        if not audio_stream:
            raise Exception("No audio stream returned from Polly")

        audio_bytes = audio_stream.read()

        unique_key = f"tts/{uuid.uuid4()}_{voice}.mp3"

        s3.put_object(
            Bucket=BUCKET_NAME,
            Key=unique_key,
            Body=audio_bytes,
            ContentType="audio/mpeg",
            ACL="public-read"
        )

        public_url = f"https://{BUCKET_NAME}.s3.{REGION}.amazonaws.com/{unique_key}"

        return {
            "statusCode": 200,
            "headers": {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "Content-Type,Authorization,Accept",
                "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
                "Access-Control-Max-Age": "3600"
            },
            "body": json.dumps({
                "audio_url": public_url,
                "voice": voice,
                "voice_id": voice_config["voice_id"],
                "engine": voice_config["engine"]
            })
        }

    except Exception as e:
        return {
            "statusCode": 500,
            "headers": {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "Content-Type,Authorization,Accept"
            },
            "body": json.dumps({"error": str(e)})