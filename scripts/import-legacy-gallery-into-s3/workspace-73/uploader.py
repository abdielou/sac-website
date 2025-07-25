#!/usr/bin/env python3
from dotenv import load_dotenv
load_dotenv()
import os
import json
import boto3
from datetime import datetime, timezone
import unicodedata

IMAGES_DIR = os.getenv('IMAGES_DIR')
S3_ENDPOINT_URL = os.getenv('S3_ENDPOINT_URL')
AWS_ACCESS_KEY_ID = os.getenv('AWS_ACCESS_KEY_ID')
AWS_SECRET_ACCESS_KEY = os.getenv('AWS_SECRET_ACCESS_KEY')
BUCKET_NAME = os.getenv('BUCKET_NAME')

if not BUCKET_NAME:
    raise RuntimeError("BUCKET_NAME must be set in your environment or .env file")

# Initializes and returns an S3 client configured with endpoint and credentials
def init_s3_client():
    return boto3.client(
        's3',
        endpoint_url=S3_ENDPOINT_URL,
        aws_access_key_id=AWS_ACCESS_KEY_ID,
        aws_secret_access_key=AWS_SECRET_ACCESS_KEY
    )

# Ensures the specified S3 bucket exists, creating it if necessary, and logs status
def ensure_bucket(s3, bucket):
    try:
        s3.create_bucket(Bucket=bucket)
    except s3.exceptions.BucketAlreadyOwnedByYou:
        pass
    except s3.exceptions.BucketAlreadyExists:
        pass

# Given an entry, constructs the local file path in IMAGES_DIR and verifies its existence
def get_file_path(entry):
    file_name = entry.get('photo_url')
    file_path = os.path.join(IMAGES_DIR, file_name) if file_name else ''
    if not file_path or not os.path.isfile(file_path):
        print(f"[SKIP] File not found: {file_path}")
        return None
    return file_path

# Parses the date or aprox-date into a datetime object; skips if missing or invalid
def get_datetime(entry, file_path):
    date_str = entry.get('date') or entry.get('aprox-date')
    if not date_str:
        print(f"[SKIP] No date for file: {file_path}")
        return None
    try:
        return datetime.strptime(date_str, "%Y-%m-%d")
    except ValueError:
        print(f"[SKIP] Invalid date format for {file_path}: {date_str}")
        return None

# Converts a datetime object into a Unix timestamp string for use as S3 key
def make_key(dt_obj, file_path):
    if dt_obj.tzinfo is None:
        dt_obj = dt_obj.replace(tzinfo=timezone.utc)
    timestamp = str(int(dt_obj.timestamp()))
    year = dt_obj.strftime('%Y')
    month = dt_obj.strftime('%m')
    day = dt_obj.strftime('%d')
    ext = os.path.splitext(file_path)[1]
    return f'{year}/{month}/{day}/{timestamp}{ext}'

# Normalizes title and description fields to ASCII-only and returns a metadata dictionary
def make_metadata(entry):
    raw_title = entry.get('title', '')
    raw_description = entry.get('description', '')
    title = unicodedata.normalize('NFKD', raw_title).encode('ascii', 'ignore').decode('ascii')
    description = unicodedata.normalize('NFKD', raw_description).encode('ascii', 'ignore').decode('ascii')
    # Represent TrueDate as string to satisfy S3 metadata requirements
    has_exact = bool(entry.get('date'))
    true_date = 'true' if has_exact else 'false'
    return {'title': title, 'description': description, 'TrueDate': true_date}

# Reads and returns binary data from the specified file path
def read_data(file_path):
    with open(file_path, 'rb') as f:
        return f.read()

# Uploads the binary data to S3 with the given key and metadata, printing status messages
def upload_object(s3, bucket, key, data, metadata, file_path):
    try:
        s3.put_object(
            Bucket=bucket, Key=key, Body=data, Metadata=metadata, ContentType='image/jpeg'
        )
        print(f"[OK] Uploaded {file_path} to {bucket}/{key}")
    except Exception as e:
        print(f"[ERROR] Failed to upload {file_path}: {e}")

# Orchestrates the steps to upload a single metadata entry to S3
def upload_entry(s3, bucket, entry):
    file_path = get_file_path(entry)
    if not file_path:
        return
    dt_obj = get_datetime(entry, file_path)
    if not dt_obj:
        return
    key = make_key(dt_obj, file_path)
    metadata = make_metadata(entry)
    data = read_data(file_path)
    upload_object(s3, bucket, key, data, metadata, file_path)


# Main routine: loads metadata.json, initializes S3 client and bucket, uploads all entries
def main():
    bucket = BUCKET_NAME
    s3 = init_s3_client()
    ensure_bucket(s3, bucket)
    try:
        with open('metadata.json', 'r', encoding='utf-8') as f:
            entries = json.load(f)
    except Exception as e:
        print(f"Error reading metadata.json: {e}")
        return
    for entry in entries:
        upload_entry(s3, bucket, entry)

if __name__ == "__main__":
    main() 