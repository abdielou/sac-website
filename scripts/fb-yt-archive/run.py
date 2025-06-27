import os
import google_auth_oauthlib
from googleapiclient import discovery
import googleapiclient.errors
import googleapiclient.http
import json
from dotenv import load_dotenv
import pickle
from google.auth.transport.requests import Request
import socket

# Force IPv4 for all socket connections (FIXED VERSION)
orig_getaddrinfo = socket.getaddrinfo
def ipv4_getaddrinfo(host, port, family=0, socktype=0, proto=0, flags=0):
    return orig_getaddrinfo(host, port, socket.AF_INET, socktype, proto, flags)
socket.getaddrinfo = ipv4_getaddrinfo

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
    import httplib2
    from google_auth_httplib2 import AuthorizedHttp
    
    # Create HTTP client with longer timeout and authorize it with credentials
    http = httplib2.Http(timeout=300)  # 5 minutes timeout
    authorized_http = AuthorizedHttp(credentials, http=http)
    
    youtube = discovery.build(
        "youtube", 
        youtube_api_version, 
        http=authorized_http,
        cache_discovery=False
    )
    return youtube

# Save credentials to token file
def save_credentials(credentials, token_file):
    with open(token_file, 'wb') as token:
        pickle.dump(credentials, token)

# Load existing credentials from token file
def load_credentials(token_file):
    if os.path.exists(token_file):
        with open(token_file, 'rb') as token:
            return pickle.load(token)
    return None

# Check if credentials are valid and refresh if needed
def refresh_credentials_if_needed(credentials):
    if credentials and credentials.expired and credentials.refresh_token:
        credentials.refresh(Request())
    return credentials

# Returns an authenticated YouTube API client with persistent token storage
def authenticate_youtube():
    os.environ["OAUTHLIB_INSECURE_TRANSPORT"] = enable_oauth_insecure_transport
    
    # Try to load existing credentials
    credentials = load_credentials(token_file)
    
    # Refresh credentials if they exist but are expired
    if credentials:
        credentials = refresh_credentials_if_needed(credentials)
    
    # If no valid credentials exist, run OAuth flow
    if not credentials or not credentials.valid:
        print("No valid credentials found. Starting OAuth flow...")
        credentials = create_oauth_flow(client_secrets_file, scopes)
        # Save credentials for future use
        save_credentials(credentials, token_file)
        print("Credentials saved for future use.")
    else:
        print("Using existing credentials.")
    
    youtube = build_youtube_client(credentials)
    return youtube

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
    entries = read_json_file(json_file)
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
    
    # Use non-resumable upload to avoid redirect issues
    media_body = googleapiclient.http.MediaFileUpload(
        media_file, 
        resumable=False
    )
    return youtube.videos().insert(part="snippet,status", body=body, media_body=media_body)

def upload_single_video(youtube, media_file, title):
    try:
        request = make_upload_request(youtube, media_file, title)
        response = request.execute()
        
        if response and 'id' in response:
            print(f"✅ Uploaded '{title}' with ID: {response['id']}")
            return True
    except Exception as e:
        print(f"⚠️  Upload failed: {str(e)[:100]}...")

    return False

# Upload multiple videos up to a limit
def upload_videos(youtube, base_dir, pending, title_map, uploaded_list, max_per_run=None):
    if max_per_run is None:
        max_per_run = max_videos_per_run
    videos_dir = get_videos_directory(base_dir)
    
    successful_uploads = 0
    failed_uploads = 0
    
    for filename in pending[:max_per_run]:
        media_file = os.path.join(videos_dir, filename)
        title = title_map[filename]
        
        print(f"\n📹 Attempting to upload: {title}")
        success = upload_single_video(youtube, media_file, title)
        
        if success:
            uploaded_list.append(filename)
            successful_uploads += 1
        else:
            failed_uploads += 1
            
        print(f"   Progress: {successful_uploads} successful, {failed_uploads} failed")
    
    print(f"\n📊 Upload Summary:")
    print(f"   ✅ Successful: {successful_uploads}")
    print(f"   ❌ Failed: {failed_uploads}")
    
    if failed_uploads > 0:
        print(f"\n⚠️  {failed_uploads} video(s) could not be uploaded due to network issues.")
        print("Failed videos will remain in queue for next run.")

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
        print(f"Found {len(pending)} video(s) to upload")
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

