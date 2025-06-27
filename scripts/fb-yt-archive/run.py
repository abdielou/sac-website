import os
import google_auth_oauthlib
from googleapiclient import discovery
import googleapiclient.errors
import googleapiclient.http
import json
from dotenv import load_dotenv

# load environment variables
load_dotenv()

scopes = json.loads(os.getenv('SCOPES')) 
token_file = os.getenv('TOKEN_FILE')
default_title = os.getenv('DEFAULT_TITLE')
client_secrets_file = os.getenv('CLIENT_SECRETS_FILE')
facebook_data_dir = os.getenv('FACEBOOK_DATA_DIR')
json_file_name = os.getenv('JSON_FILE')
json_file = os.path.join(facebook_data_dir, json_file_name)
youtube_category_id = os.getenv('YOUTUBE_CATEGORY_ID', '22')  
youtube_api_version = os.getenv('YOUTUBE_API_VERSION', 'v3')
youtube_privacy_status = os.getenv('YOUTUBE_PRIVACY_STATUS', 'public')
upload_chunk_size = int(os.getenv('UPLOAD_CHUNK_SIZE', '-1'))  
max_videos_per_run = int(os.getenv('MAX_VIDEOS_PER_RUN', '6'))
video_file_extensions = os.getenv('VIDEO_FILE_EXTENSIONS', '.mp4').split(',')
enable_oauth_insecure_transport = os.getenv('OAUTH_INSECURE_TRANSPORT', '1')
videos_subpath_parts = os.getenv('VIDEOS_SUBPATH', 'your_facebook_activity,live_videos').split(',')
registry_filename = os.getenv('REGISTRY_FILENAME')

VIDEOS_SUBPATH = tuple(videos_subpath_parts)
REGISTRY_FILENAME = registry_filename

# Helper function 
def get_videos_directory(base_dir):
    return os.path.join(base_dir, *VIDEOS_SUBPATH)

# Helper function 
def read_json_file(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        return json.load(f)

# Helper function 
def extract_label_value(entry, label_name):
    return next((lv.get('value') for lv in entry.get('label_values', []) if lv.get('label') == label_name), None)

# Removes existing token file for a new one later
def clear_existing_token(token_file):
    if os.path.exists(token_file):
        os.remove(token_file)
        return True #TEST
    return False #TEST

# Create and run OAuth flow for authentication
def create_oauth_flow(client_secrets_file, scopes):
    flow = google_auth_oauthlib.flow.InstalledAppFlow.from_client_secrets_file(
        client_secrets_file, scopes)
    credentials = flow.run_local_server()
    return credentials

# Build youtube API client
def build_youtube_client(credentials):
    youtube = discovery.build("youtube", youtube_api_version, credentials=credentials)
    return youtube

# Returns an authenticated YouTube API client
# Calls clear_existing_token, create_oauth_flow, build_youtube_client
def authenticate_youtube():
    os.environ["OAUTHLIB_INSECURE_TRANSPORT"] = enable_oauth_insecure_transport
    clear_existing_token(token_file)
    
    credentials = create_oauth_flow(client_secrets_file, scopes)
    youtube = build_youtube_client(credentials)
    
    return youtube

# Open and parse the JSON file
def parse_json_file(json_file):
    return read_json_file(json_file)

# Extract the video filename from an entry
def extract_video_filename(entry):
    video_lv = next((lv for lv in entry.get('label_values', []) if lv.get('label') == 'Video'), None)
    if not video_lv or not video_lv.get('media'):
        return None
    uri = video_lv['media'][0].get('uri')
    if not uri:
        return None
    filename = uri.split('/')[-1]
    return filename

# Extract the title from an entry
def extract_video_title(entry):
    title = extract_label_value(entry, 'Title')
    if not title:  # for videos with no titles 
        title = default_title
    return title

# Extract metadata to build mapping of filenames to titles from the JSON file
def build_title_map(json_file):
    # Open and parse the JSON file
    entries = parse_json_file(json_file)
    # Build mapping
    title_map = {}
    
    # Loop through each entry
    for entry in entries:
        # Extract the video filename
        filename = extract_video_filename(entry)
        if not filename:
            continue
            
        # Extract the title
        title = extract_video_title(entry)
        
        # Build mapping
        title_map[filename] = title
    
    return title_map

# Determine which videos need uploading
def get_pending_videos(videos_dir, uploaded_list, title_map):
    pending = []
    for filename in sorted(os.listdir(videos_dir)):
        if not filename.lower().endswith(tuple(video_file_extensions)):
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
        "snippet": {"categoryId": youtube_category_id, "title": title},
        "status": {"privacyStatus": youtube_privacy_status}
    }
    media_body = googleapiclient.http.MediaFileUpload(media_file, chunksize=upload_chunk_size, resumable=True)
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

# Upload multiple videos up to a limit
def upload_videos(youtube, base_dir, pending, title_map, uploaded_list, max_per_run=None):
    if max_per_run is None:
        max_per_run = max_videos_per_run
    videos_dir = get_videos_directory(base_dir)
    for filename in pending[:max_per_run]:
        media_file = os.path.join(videos_dir, filename)
        title = title_map[filename]
        upload_single_video(youtube, media_file, title)
        uploaded_list.append(filename)

# Loads the registry file and returns its path and the list of uploaded files.
def initialize_registry(base_dir):
    registry_file = os.path.join(base_dir, REGISTRY_FILENAME)
    if os.path.exists(registry_file):
        uploaded_list = read_json_file(registry_file)
    else:
        uploaded_list = []
    return registry_file, uploaded_list

# Saves the list of uploaded files to the registry file 
def save_registry(registry_file, uploaded_list):
    with open(registry_file, 'w', encoding='utf-8') as rf:
        json.dump(uploaded_list, rf, indent=2)

# Handle video upload process
def handle_video_upload_process(youtube, facebook_data_dir, pending, title_map, uploaded_list, videos_dir):

    if not pending:
        print("No videos to upload - All videos have already been uploaded or no new videos found.")
        print(f"Videos directory: {videos_dir}")
        print(f"Total videos in registry: {len(uploaded_list)}")
        print(f"Total videos with metadata: {len(title_map)}")
    else:
        print(f"Found {len(pending)} video to upload")
        # Upload pending videos and update the uploaded list
        upload_videos(youtube, facebook_data_dir, pending, title_map, uploaded_list)
        print(f"Upload process completed")


if __name__ == "__main__":
    # Authenticate 
    youtube = authenticate_youtube()

    # Build title map 
    title_map = build_title_map(json_file)

    # load the registry of uploaded videos
    registry_file, uploaded_list = initialize_registry(facebook_data_dir)

    # Determine pending videos 
    videos_dir = get_videos_directory(facebook_data_dir)
    pending = get_pending_videos(videos_dir, uploaded_list, title_map)

    # Handle video upload process
    handle_video_upload_process(youtube, facebook_data_dir, pending, title_map, uploaded_list, videos_dir)

    # Save the updated registry
    save_registry(registry_file, uploaded_list)

