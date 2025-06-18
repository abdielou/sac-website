# Import required libraries
import os
import google_auth_oauthlib
from googleapiclient import discovery
import googleapiclient.errors
import googleapiclient.http
import json

# Define the required permissions for YouTube API
SCOPES = ["https://www.googleapis.com/auth/youtube.upload"]
TOKEN_FILE = 'token.json'
CLIENT_SECRETS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'client.json')
DEFAULT_TITLE = "Live video-Sociedad de Astronomia del Caribe"
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
    # Allow OAuth2 over HTTP (not recommended for production)
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

def upload_video(youtube):
    # Build a map of local filenames to titles using JSON metadata
    base_dir = SAMPLE_DIR
    json_file = JSON_FILE
    with open(json_file, 'r', encoding='utf-8') as f:
        video_entries = json.load(f)
    title_map = {}
    for entry in video_entries:
        video_lv = next((lv for lv in entry.get('label_values', []) if lv.get('label') == 'Video'), None)
        # skip entries without video media
        if not video_lv or not video_lv.get('media'):
            continue
        uri = video_lv['media'][0].get('uri')
        if not uri:
            continue
        filename = uri.split('/')[-1]
        # try to get title, otherwise use default
        title = next((lv.get('value') for lv in entry.get('label_values', []) if lv.get('label') == 'Title'), None)
        if not title:
            title = DEFAULT_TITLE
        title_map[filename] = title

    # Load or initialize registry of uploaded files
    registry_file, uploaded_list = initialize_registry(base_dir)
    max_per_run = 6

    # Build pending upload list
    videos_dir = os.path.join(base_dir, 'your_facebook_activity', 'live_videos')
    all_files = sorted(os.listdir(videos_dir))
    pending = []
    for filename in all_files:
        if not filename.lower().endswith('.mp4') or filename in uploaded_list:
            continue
        if filename not in title_map:
            print(f"Skipping {filename}: no title found in JSON metadata")
            continue
        pending.append(filename)

    # Upload up to max_per_run videos and update registry
    for filename in pending[:max_per_run]:
        media_file = os.path.join(videos_dir, filename)
        title = title_map[filename]
        request_body = {
            "snippet": {
                "categoryId": "22",
                "title": title
            },
            "status": {
                "privacyStatus": "public"  # change to private if needed
            }
        }
        request = youtube.videos().insert(
            part="snippet,status",
            body=request_body,
            media_body=googleapiclient.http.MediaFileUpload(media_file, chunksize=-1, resumable=True)
        )
        response = None
        while response is None:
            status, response = request.next_chunk()
            if status:
                print(f"Uploading '{title}': {int(status.progress() * 100)}%")
        print(f"Uploaded '{title}' with ID: {response['id']}")
        uploaded_list.append(filename)

    # Save registry of uploaded files
    save_registry(registry_file, uploaded_list)

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
    # authenticate with YouTube
    youtube = authenticate_youtube()
    # upload the video
    upload_video(youtube)

