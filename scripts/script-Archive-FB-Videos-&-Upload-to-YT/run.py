import os
import google_auth_oauthlib
from googleapiclient import discovery
import googleapiclient.errors
import googleapiclient.http
import json

# Define the required permissions for youtube API
SCOPES = ["https://www.googleapis.com/auth/youtube.upload"]
TOKEN_FILE = 'token.json'
DEFAULT_TITLE = "Live video-Sociedad de Astronomia del Caribe"
CLIENT_SECRETS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'client.json')
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SAMPLE_DIR = os.path.join(SCRIPT_DIR, 'facebook-sociedadastronomia')
JSON_FILE = os.path.join(
    SAMPLE_DIR,
    "this_profile's_activity_across_facebook",
    'live_videos',
    'live_videos.json'
)

# Returns an authenticated YouTube API client
def authenticate_youtube():
    os.environ["OAUTHLIB_INSECURE_TRANSPORT"] = "1"

    # Remove existing token file if it exists to force new authentication
    if os.path.exists(TOKEN_FILE):
        os.remove(TOKEN_FILE)

    # Path to your OAuth 2.0 client credentials file
    # This file should be downloaded from Google Cloud Console
    client_secrets_file = CLIENT_SECRETS_FILE

    # Create OAuth 2.0 flow and run local server for authentication
    flow = google_auth_oauthlib.flow.InstalledAppFlow.from_client_secrets_file(
        client_secrets_file, SCOPES)
    credentials = flow.run_local_server()

    # Build and return the YouTube API client
    youtube = discovery.build(
        "youtube", "v3", credentials=credentials)

    return youtube

# Extract metadata to build mapping of filenames to titles from the JSON file
def build_title_map(json_file):
    with open(json_file, 'r', encoding='utf-8') as f:
        entries = json.load(f)
    title_map = {}
    for entry in entries:
        video_lv = next((lv for lv in entry.get('label_values', []) if lv.get('label') == 'Video'), None)
        if not video_lv or not video_lv.get('media'):
            continue
        uri = video_lv['media'][0].get('uri')
        if not uri:
            continue
        filename = uri.split('/')[-1]
        title = next((lv.get('value') for lv in entry.get('label_values', []) if lv.get('label') == 'Title'), None)
        if not title:
            title = DEFAULT_TITLE
        title_map[filename] = title
    return title_map

# Determine which videos need uploading
def get_pending_videos(videos_dir, uploaded_list, title_map):
    pending = []
    for filename in sorted(os.listdir(videos_dir)):
        if not filename.lower().endswith('.mp4'):
            continue
        if filename in uploaded_list:
            continue
        if filename not in title_map:
            print(f"Skipping {filename}: no title found in JSON metadata")
            continue
        pending.append(filename)
    return pending

# Upload a single video and print progress
def make_upload_request(youtube, media_file, title):
    body = {
        "snippet": {"categoryId": "22", "title": title},
        "status": {"privacyStatus": "public"}
    }
    media_body = googleapiclient.http.MediaFileUpload(media_file, chunksize=-1, resumable=True)
    return youtube.videos().insert(part="snippet,status", body=body, media_body=media_body)

def perform_resumable_upload(request, title):
    response = None
    while response is None:
        status, response = request.next_chunk()
        if status:
            print(f"Uploading '{title}': {int(status.progress() * 100)}%")
    return response

def upload_single_video(youtube, media_file, title):
    request = make_upload_request(youtube, media_file, title)
    response = perform_resumable_upload(request, title)
    print(f"Uploaded '{title}' with ID: {response['id']}")

# Upload multiple videos up to a maximum limit
def upload_videos(youtube, base_dir, pending, title_map, uploaded_list, max_per_run=6):
    videos_dir = os.path.join(base_dir, 'your_facebook_activity', 'live_videos')
    for filename in pending[:max_per_run]:
        media_file = os.path.join(videos_dir, filename)
        title = title_map[filename]
        upload_single_video(youtube, media_file, title)
        uploaded_list.append(filename)

# Main function orchestrating the upload process
def upload_video(youtube):
    # Orchestration is handled in the __main__ block; this function is now a no-op.
    pass

# Loads or initializes the registry file and returns its path and the list of uploaded files.
def initialize_registry(base_dir):
    registry_file = os.path.join(base_dir, 'uploaded_registry.json')
    if os.path.exists(registry_file):
        with open(registry_file, 'r', encoding='utf-8') as rf:
            uploaded_list = json.load(rf)
    else:
        uploaded_list = []
    return registry_file, uploaded_list

# Saves the list of uploaded files to the registry file to avoid duplicates.
def save_registry(registry_file, uploaded_list):
    with open(registry_file, 'w', encoding='utf-8') as rf:
        json.dump(uploaded_list, rf, indent=2)


if __name__ == "__main__":
    # Authenticate with YouTube
    youtube = authenticate_youtube()

    # Build title map from metadata
    title_map = build_title_map(JSON_FILE)

    # Initialize or load the registry of uploaded videos
    registry_file, uploaded_list = initialize_registry(SAMPLE_DIR)

    # Determine which videos are pending
    videos_dir = os.path.join(SAMPLE_DIR, 'your_facebook_activity', 'live_videos')
    pending = get_pending_videos(videos_dir, uploaded_list, title_map)

    # Upload pending videos and update the uploaded list
    upload_videos(youtube, SAMPLE_DIR, pending, title_map, uploaded_list)

    # Save the updated registry
    save_registry(registry_file, uploaded_list)

