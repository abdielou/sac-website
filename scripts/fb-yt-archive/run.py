import os
import sys
import argparse
import tempfile
import datetime
import zipfile
from contextlib import contextmanager
import google_auth_oauthlib
from googleapiclient import discovery
import googleapiclient.errors
import googleapiclient.http
import json
from dotenv import load_dotenv
import pickle
from google.auth.transport.requests import Request
import socket

# Optional colored output (graceful degradation if colorama not installed)
try:
    from colorama import Fore, Style, just_fix_windows_console
    just_fix_windows_console()
    COLORS_AVAILABLE = True
except ImportError:
    COLORS_AVAILABLE = False
    class Fore:
        GREEN = RED = YELLOW = CYAN = MAGENTA = ''
    class Style:
        RESET_ALL = ''

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

def print_status(message, status='info'):
    """Print colored status message."""
    colors = {
        'success': Fore.GREEN,
        'error': Fore.RED,
        'warning': Fore.YELLOW,
        'info': Fore.CYAN,
        'skip': Fore.MAGENTA,
    }
    color = colors.get(status, '')
    reset = Style.RESET_ALL if color else ''
    print(f"{color}{message}{reset}")


def print_summary(uploaded_titles, skipped, errors, error_messages=None):
    """Print concise processing summary.

    Args:
        uploaded_titles: List of uploaded video titles
        skipped: Count of skipped videos
        errors: Count of errors
        error_messages: Optional list of brief error messages
    """
    print(f"\n{'='*40}")
    print("SUMMARY")
    print(f"{'='*40}")

    # Uploaded videos (list titles)
    if uploaded_titles:
        print_status(f"Uploaded ({len(uploaded_titles)}):", 'success')
        for title in uploaded_titles:
            # Truncate long titles
            display_title = title[:50] + "..." if len(title) > 50 else title
            print(f"  - {display_title}")
    else:
        print_status("Uploaded: 0", 'info')

    # Skipped (just count)
    if skipped > 0:
        print_status(f"Skipped: {skipped} duplicate(s)", 'skip')

    # Errors (count + brief messages)
    if errors > 0:
        print_status(f"Errors: {errors}", 'error')
        if error_messages:
            for msg in error_messages[:5]:  # Show max 5 errors
                print(f"  - {msg[:60]}")
            if len(error_messages) > 5:
                print(f"  ... and {len(error_messages) - 5} more")

    print(f"{'='*40}")


# Helper function
def get_videos_directory(base_dir):
    return os.path.join(base_dir, *VIDEOS_SUBPATH)

# Helper function
def read_json_file(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        return json.load(f)


def fix_facebook_encoding(text):
    """Fix Facebook's broken UTF-8 encoding in JSON exports.

    Facebook exports UTF-8 text but stores it incorrectly in JSON,
    causing characters like '¿' to appear as 'Â¿'.

    The fix: encode as latin-1 (to get original bytes) then decode as UTF-8.
    """
    if not text:
        return text
    try:
        return text.encode('latin-1').decode('utf-8')
    except (UnicodeDecodeError, UnicodeEncodeError):
        # If conversion fails, return original text
        return text


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


@contextmanager
def extract_zip(zip_path):
    """Extract zip to temp directory, auto-cleanup on exit (AUTO-02).

    Use ignore_cleanup_errors=True for Windows file locking issues.

    Args:
        zip_path: Full path to the zip file

    Yields:
        Path to the temporary directory containing extracted contents
    """
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as temp_dir:
        with zipfile.ZipFile(zip_path, 'r') as zf:
            zf.extractall(temp_dir)
        yield temp_dir


def find_metadata_in_extracted(temp_dir):
    """Find the live_videos.json metadata file in extracted folder (AUTO-03).

    Facebook exports have nested structure. Search for live_videos.json.

    Args:
        temp_dir: Path to the extracted directory

    Returns:
        Full path to JSON file, or None if not found.
    """
    for root, dirs, files in os.walk(temp_dir):
        for filename in files:
            if filename == 'live_videos.json':
                return os.path.join(root, filename)
    return None


def find_videos_dir_in_extracted(temp_dir):
    """Find the live_videos directory containing .mp4 files.

    Args:
        temp_dir: Path to the extracted directory

    Returns:
        Full path to directory containing mp4 files, or None if not found.
    """
    for root, dirs, files in os.walk(temp_dir):
        # Check if this directory contains mp4 files
        mp4_files = [f for f in files if f.lower().endswith('.mp4')]
        if mp4_files:
            return root
    return None


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


def extract_creation_timestamp(entry):
    """Extract creation timestamp from Facebook metadata entry.

    Facebook exports include 'timestamp' as Unix timestamp (seconds since epoch).

    Args:
        entry: A metadata entry from live_videos.json

    Returns:
        datetime object if timestamp found, None otherwise
    """
    # Primary: entry-level 'timestamp' field
    timestamp = entry.get('timestamp')
    if timestamp:
        try:
            return datetime.datetime.fromtimestamp(timestamp)
        except (ValueError, TypeError, OSError):
            pass
    return None

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
def create_oauth_flow(client_secrets_file, scopes, timeout_seconds=60):
    """Run OAuth flow with timeout.

    Args:
        client_secrets_file: Path to OAuth client secrets JSON
        scopes: List of OAuth scopes to request
        timeout_seconds: How long to wait for user to complete auth (default 60s)

    Returns:
        OAuth credentials

    Raises:
        TimeoutError: If user doesn't complete auth within timeout
    """
    flow = google_auth_oauthlib.flow.InstalledAppFlow.from_client_secrets_file(
        client_secrets_file, scopes)
    print_status(f"You have {timeout_seconds} seconds to complete authentication...", 'info')
    try:
        credentials = flow.run_local_server(timeout_seconds=timeout_seconds)
    except Exception as e:
        if 'timed out' in str(e).lower() or isinstance(e, TimeoutError):
            raise TimeoutError(f"OAuth authentication timed out after {timeout_seconds} seconds. Run again to retry.")
        raise
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
def refresh_credentials_if_needed(credentials, token_file_path):
    if credentials and credentials.expired and credentials.refresh_token:
        try:
            credentials.refresh(Request())
        except Exception as e:
            # Token invalid/revoked - clear it and return None to trigger re-auth
            print_status(f"Token refresh failed: {str(e)[:50]}", 'warning')
            print_status("Clearing invalid token and re-authenticating...", 'info')
            if os.path.exists(token_file_path):
                os.remove(token_file_path)
            return None
    return credentials

# Returns an authenticated YouTube API client with persistent token storage
def authenticate_youtube():
    os.environ["OAUTHLIB_INSECURE_TRANSPORT"] = enable_oauth_insecure_transport
    
    # Try to load existing credentials
    credentials = load_credentials(token_file)
    
    # Refresh credentials if they exist but are expired
    if credentials:
        credentials = refresh_credentials_if_needed(credentials, token_file)
    
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

# Extract the title from an entry (with optional timestamp prefix)
def extract_video_title(entry, include_timestamp=True):
    """Extract video title from entry, optionally with date prefix.

    Args:
        entry: A metadata entry from live_videos.json
        include_timestamp: If True, prefix title with [YYYY-MM-DD] from creation_timestamp

    Returns:
        Title string, with encoding fixed and optional date prefix
    """
    title = extract_label_value(entry, 'Title')
    if not title:  # for videos with no titles
        title = default_title
    # Fix Facebook's broken UTF-8 encoding
    title = fix_facebook_encoding(title)

    # Add timestamp prefix if available
    if include_timestamp:
        timestamp = extract_creation_timestamp(entry)
        if timestamp:
            date_str = timestamp.strftime('%Y-%m-%d')
            title = f"[{date_str}] {title}"

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


def process_inbox(dry_run=False, verbose=False):
    """Main entry point: process all unprocessed zips from inbox folder.

    Args:
        dry_run: If True, show what would be uploaded without actually uploading.
        verbose: If True, show detailed output. Quiet by default.

    This function:
    1. Loads registry (uploaded_fbids, processed_zips, daily_uploads)
    2. Scans inbox for unprocessed zip files
    3. Authenticates with YouTube API (skipped in dry-run mode)
    4. For each zip: extracts, reads metadata, processes videos
    5. For each video: checks fbid for duplicates, uploads if new
    6. Saves registry after EACH successful upload (crash-safe)
    7. Stops gracefully when daily limit reached
    8. Marks zips as processed when complete
    9. Prints summary at end
    """
    if dry_run:
        print_status("=== DRY RUN MODE - No uploads will occur ===", 'warning')

    # Counters and trackers for summary
    uploaded_titles = []  # Track titles for concise summary
    error_messages = []   # Track brief error messages
    total_skipped = 0
    total_errors = 0

    # Load registry
    if verbose:
        print_status("Loading registry...", 'info')
    registry = load_registry(REGISTRY_PATH)
    uploaded_fbids = set(registry.get("uploaded_fbids", []))
    processed_zips = registry.get("processed_zips", [])

    # Scan inbox for unprocessed zips
    if verbose:
        print_status(f"Scanning inbox: {INBOX_PATH}", 'info')
    pending_zips = scan_inbox(INBOX_PATH, processed_zips)

    if not pending_zips:
        print_status("No unprocessed zip files found in inbox.", 'info')
        print_summary(uploaded_titles, total_skipped, total_errors, error_messages)
        return

    print_status(f"Found {len(pending_zips)} zip file(s) to process", 'info')

    # Check if we can upload today before authenticating (skip check in dry-run)
    if not dry_run and not can_upload_today(registry, max_videos_per_run):
        print_status("Daily upload limit already reached. Run again tomorrow.", 'warning')
        print_summary(uploaded_titles, total_skipped, total_errors, error_messages)
        return

    # Authenticate with YouTube (skip in dry-run mode)
    youtube = None
    if not dry_run:
        if verbose:
            print_status("Authenticating with YouTube...", 'info')
        youtube = authenticate_youtube()
    elif verbose:
        print_status("Skipping YouTube authentication (dry-run)", 'info')

    # Process each zip file
    for zip_path in pending_zips:
        zip_name = os.path.basename(zip_path)
        print_status(f"\nProcessing: {zip_name}", 'info')

        try:
            with extract_zip(zip_path) as temp_dir:
                # Find metadata file
                metadata_path = find_metadata_in_extracted(temp_dir)
                if not metadata_path:
                    error_messages.append(f"{zip_name}: no metadata found")
                    total_errors += 1
                    if verbose:
                        print_status(f"  No live_videos.json found in {zip_name}", 'error')
                    continue

                # Find videos directory
                videos_dir = find_videos_dir_in_extracted(temp_dir)
                if not videos_dir:
                    error_messages.append(f"{zip_name}: no videos found")
                    total_errors += 1
                    if verbose:
                        print_status(f"  No video files found in {zip_name}", 'error')
                    continue

                # Read metadata and sort by creation timestamp (oldest first)
                entries = read_json_file(metadata_path)
                entries = sorted(
                    entries,
                    key=lambda e: extract_creation_timestamp(e) or datetime.datetime.max
                )
                if verbose:
                    print_status(f"  Found {len(entries)} video entries in metadata (sorted oldest first)", 'info')

                # Track intra-zip duplicates
                seen_fbids_in_zip = set()
                zip_uploaded = 0
                zip_skipped = 0
                zip_errors = 0

                # Process each entry
                for entry in entries:
                    # Check daily limit before each upload (skip check in dry-run)
                    if not dry_run and not can_upload_today(registry, max_videos_per_run):
                        print_status("\nDaily limit reached. Run again tomorrow.", 'warning')
                        # Save registry before exiting
                        save_registry_atomic(REGISTRY_PATH, registry)
                        total_skipped += zip_skipped
                        total_errors += zip_errors
                        print_summary(uploaded_titles, total_skipped, total_errors, error_messages)
                        return

                    # Extract fbid for deduplication
                    fbid = extract_fbid(entry)
                    if not fbid:
                        if verbose:
                            print_status(f"  Skipping entry: no fbid found", 'warning')
                        zip_errors += 1
                        continue

                    # Check for cross-zip duplicate (already uploaded)
                    if fbid in uploaded_fbids:
                        # Silently skip cross-zip duplicates
                        zip_skipped += 1
                        continue

                    # Check for intra-zip duplicate
                    if fbid in seen_fbids_in_zip:
                        if verbose:
                            print_status(f"  Skipping {fbid}: duplicate within zip", 'warning')
                        zip_skipped += 1
                        continue

                    seen_fbids_in_zip.add(fbid)

                    # Get video filename and build path
                    filename = extract_video_filename(entry)
                    if not filename:
                        if verbose:
                            print_status(f"  Skipping {fbid}: no filename found", 'warning')
                        zip_errors += 1
                        continue

                    video_path = os.path.join(videos_dir, filename)
                    if not os.path.exists(video_path):
                        if verbose:
                            print_status(f"  Skipping {fbid}: video file not found", 'error')
                        zip_errors += 1
                        continue

                    # Get title
                    title = extract_video_title(entry)

                    if dry_run:
                        # Dry-run: show what would be uploaded
                        print_status(f"  [WOULD UPLOAD] {title}", 'info')
                        if verbose:
                            file_size_mb = os.path.getsize(video_path) / (1024 * 1024)
                            print_status(f"    fbid: {fbid}", 'info')
                            print_status(f"    file: {filename} ({file_size_mb:.1f} MB)", 'info')
                        uploaded_titles.append(title)
                        zip_uploaded += 1
                    else:
                        # Actual upload
                        print_status(f"  Uploading: {title}", 'info')
                        success = upload_single_video(youtube, video_path, title)

                        if success:
                            # Record in registry
                            record_upload(registry, fbid)
                            uploaded_fbids.add(fbid)
                            uploaded_titles.append(title)
                            zip_uploaded += 1

                            # Save registry immediately (crash-safe)
                            save_registry_atomic(REGISTRY_PATH, registry)
                            if verbose:
                                print_status(f"    Uploaded successfully", 'success')
                        else:
                            zip_errors += 1
                            error_messages.append(f"Upload failed: {title[:40]}")
                            if verbose:
                                print_status(f"    Upload failed", 'error')

                # Update totals
                total_skipped += zip_skipped
                total_errors += zip_errors

                if verbose:
                    print_status(f"  Zip complete: {zip_uploaded} uploaded, {zip_skipped} skipped, {zip_errors} errors", 'info')

        except zipfile.BadZipFile:
            error_messages.append(f"{zip_name}: corrupted zip")
            total_errors += 1
            print_status(f"  Invalid or corrupted zip file: {zip_name}", 'error')
            continue
        except Exception as e:
            error_messages.append(f"{zip_name}: {str(e)[:40]}")
            total_errors += 1
            print_status(f"  Error processing {zip_name}: {str(e)[:100]}", 'error')
            continue

        # Mark zip as processed (only after successful processing, skip in dry-run)
        if not dry_run:
            registry["processed_zips"].append(zip_name)
            save_registry_atomic(REGISTRY_PATH, registry)
            if verbose:
                print_status(f"  Marked {zip_name} as processed", 'success')

    # Final summary
    if dry_run:
        print_status("\n=== DRY RUN COMPLETE ===", 'warning')
        print_summary(uploaded_titles, total_skipped, total_errors, error_messages)
        print_status("Run without --dry-run to actually upload", 'info')
    else:
        print_summary(uploaded_titles, total_skipped, total_errors, error_messages)


def main():
    """Parse arguments and run the inbox processor."""
    parser = argparse.ArgumentParser(
        description='Upload Facebook Live videos to YouTube from inbox folder.',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog='''
Examples:
  python run.py              # Process and upload videos (quiet mode)
  python run.py -v           # Verbose output with detailed logging
  python run.py --dry-run    # Preview what would be uploaded
  python run.py -n -v        # Dry-run with verbose output
'''
    )
    parser.add_argument(
        '--dry-run', '-n',
        action='store_true',
        help='Show what would be uploaded without actually uploading'
    )
    parser.add_argument(
        '--verbose', '-v',
        action='store_true',
        help='Show detailed output (quiet by default)'
    )
    args = parser.parse_args()
    process_inbox(dry_run=args.dry_run, verbose=args.verbose)


if __name__ == "__main__":
    main()

