import os
import tempfile
import datetime
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

# Get script directory for relative paths (CONF-02: registry stored in script directory)
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

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
inbox_dir = os.getenv('INBOX_DIR', 'inbox')

VIDEOS_SUBPATH = tuple(videos_subpath_parts)
REGISTRY_FILENAME = registry_filename

# Resolve inbox and registry paths relative to script directory (CONF-02)
INBOX_PATH = os.path.join(SCRIPT_DIR, inbox_dir)
REGISTRY_PATH = os.path.join(SCRIPT_DIR, 'registry.json')

# Helper function 
def get_videos_directory(base_dir):
    return os.path.join(base_dir, *VIDEOS_SUBPATH)

# Helper function
def read_json_file(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        return json.load(f)


# Ensure inbox directory exists
def ensure_inbox_exists():
    os.makedirs(INBOX_PATH, exist_ok=True)
    return INBOX_PATH


def scan_inbox(inbox_path, processed_zips):
    """Find unprocessed zip files in inbox folder (AUTO-01, AUTO-05).

    Args:
        inbox_path: Path to the inbox directory
        processed_zips: List/set of already processed zip filenames

    Returns:
        List of full paths to unprocessed zip files, sorted alphabetically
    """
    # Ensure inbox exists (auto-create if missing)
    ensure_inbox_exists()

    # List all files and filter to .zip files (case-insensitive)
    try:
        all_files = os.listdir(inbox_path)
    except OSError:
        return []

    zip_files = [f for f in all_files if f.lower().endswith('.zip')]

    # Exclude already-processed zips
    pending_zips = [f for f in zip_files if f not in processed_zips]

    # Return sorted list of full paths
    return [os.path.join(inbox_path, f) for f in sorted(pending_zips)]


# Registry structure:
# {
#   "uploaded_fbids": ["123456789", "987654321"],
#   "processed_zips": ["facebook-2024-01.zip"],
#   "daily_uploads": {"2026-01-27": 3}
# }

def get_empty_registry():
    """Return empty registry structure."""
    return {
        "uploaded_fbids": [],
        "processed_zips": [],
        "daily_uploads": {}
    }


def load_registry(registry_file):
    """Load registry from file, handling migration from old format."""
    if not os.path.exists(registry_file):
        return get_empty_registry()

    try:
        with open(registry_file, 'r', encoding='utf-8') as f:
            data = json.load(f)

        # Migration: if loaded data is a list (old format), convert to new format
        if isinstance(data, list):
            return {
                "uploaded_fbids": data,  # Old format was list of filenames, treat as fbids
                "processed_zips": [],
                "daily_uploads": {}
            }

        # Ensure all keys exist
        if "uploaded_fbids" not in data:
            data["uploaded_fbids"] = []
        if "processed_zips" not in data:
            data["processed_zips"] = []
        if "daily_uploads" not in data:
            data["daily_uploads"] = {}

        return data
    except (json.JSONDecodeError, IOError):
        return get_empty_registry()


def save_registry_atomic(registry_file, data):
    """Save registry with atomic write to prevent corruption on crash."""
    dir_path = os.path.dirname(registry_file)
    if dir_path and not os.path.exists(dir_path):
        os.makedirs(dir_path, exist_ok=True)

    # Create temp file in same directory for atomic rename
    fd, temp_path = tempfile.mkstemp(dir=dir_path if dir_path else '.')
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2)
            f.flush()
            os.fsync(f.fileno())
        # Atomic rename (works on POSIX and Windows when files on same filesystem)
        os.replace(temp_path, registry_file)
    except Exception:
        # Clean up temp file on failure
        try:
            os.unlink(temp_path)
        except OSError:
            pass
        raise


def can_upload_today(registry, max_per_day=6):
    """Check if we can upload more videos today."""
    today = datetime.date.today().isoformat()
    daily_uploads = registry.get("daily_uploads", {})
    return daily_uploads.get(today, 0) < max_per_day


def record_upload(registry, fbid):
    """Record a successful upload in the registry."""
    today = datetime.date.today().isoformat()

    # Add fbid to uploaded list
    if fbid not in registry["uploaded_fbids"]:
        registry["uploaded_fbids"].append(fbid)

    # Increment daily count
    if today not in registry["daily_uploads"]:
        registry["daily_uploads"][today] = 0
    registry["daily_uploads"][today] += 1


def extract_fbid(entry):
    """Extract Facebook video ID from an entry."""
    video_lv = next((lv for lv in entry.get('label_values', []) if lv.get('label') == 'Video'), None)
    if not video_lv or not video_lv.get('media'):
        return None
    uri = video_lv['media'][0].get('uri')
    if not uri:
        return None
    # Extract fbid from filename (e.g., "123456789.mp4" -> "123456789")
    filename = uri.split('/')[-1]
    fbid = filename.replace('.mp4', '').replace('.MP4', '')
    return fbid if fbid else None

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

# Loads the registry and returns backward-compatible tuple for existing code
# Note: Uses REGISTRY_PATH (script directory) per CONF-02, not per-zip directory
def initialize_registry(base_dir=None):
    """Load registry using new infrastructure, return backward-compatible format.

    Args:
        base_dir: Ignored. Kept for backward compatibility. Registry is always
                  stored in script directory (CONF-02).

    Returns:
        tuple: (registry_file_path, uploaded_list) for backward compatibility
               The uploaded_list is extracted from registry["uploaded_fbids"]
    """
    registry = load_registry(REGISTRY_PATH)
    # For backward compatibility, return the fbids list (previously was filename list)
    uploaded_list = registry.get("uploaded_fbids", [])
    return REGISTRY_PATH, uploaded_list


# Saves the registry using atomic write for crash safety
def save_registry(registry_file, uploaded_list):
    """Save registry using atomic write. Maintains backward compatibility.

    This function wraps save_registry_atomic() and handles the case where
    uploaded_list might be a simple list (old code) or we need to preserve
    the full registry structure.
    """
    # Load existing registry to preserve other fields
    existing = load_registry(registry_file)
    existing["uploaded_fbids"] = uploaded_list
    save_registry_atomic(registry_file, existing)

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

