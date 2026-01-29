from dotenv import load_dotenv
import unittest
from unittest.mock import patch, Mock
import datetime
import tempfile
import os
import json
import run


load_dotenv()

class TestRun(unittest.TestCase):

    
    @patch('os.path.join')
    def test_get_videos_directory(self, mock_join):
        # Arrange
        base_dir = 'test_base_dir'
        expected_path = 'test_base_dir/your_facebook_activity/live_videos'
        mock_join.return_value = expected_path
        
        # Act
        result = run.get_videos_directory(base_dir)
        
        # Assert
        mock_join.assert_called_once_with(base_dir, 'your_facebook_activity', 'live_videos')
        self.assertEqual(result, expected_path)

    
    @patch('builtins.open')
    @patch('json.load')
    def test_read_json_file(self, mock_json_load, mock_open):
        # Arrange
        file_path = 'test_file.json'
        expected_data = {'test': 'data'}
        mock_file = Mock()
        mock_open.return_value.__enter__.return_value = mock_file
        mock_json_load.return_value = expected_data
        
        # Act
        result = run.read_json_file(file_path)
        
        # Assert
        mock_open.assert_called_once_with(file_path, 'r', encoding='utf-8')
        mock_json_load.assert_called_once_with(mock_file)
        self.assertEqual(result, expected_data)

    
    def test_extract_label_value_found(self):
        # Arrange
        entry = {
            'label_values': [
                {'label': 'Title', 'value': 'Test Video Title'},
                {'label': 'Other', 'value': 'Other Value'}
            ]
        }
        
        # Act
        result = run.extract_label_value(entry, 'Title')
        
        # Assert
        self.assertEqual(result, 'Test Video Title')


    def test_extract_label_value_not_found(self):
        # Arrange
        entry = {
            'label_values': [
                {'label': 'Other', 'value': 'Other Value'}
            ]
        }
        
        # Act
        result = run.extract_label_value(entry, 'Title')
        
        # Assert
        self.assertIsNone(result)

    def test_extract_label_value_empty_entry(self):
        # Arrange
        entry = {}
        
        # Act
        result = run.extract_label_value(entry, 'Title')
        
        # Assert
        self.assertIsNone(result)

    
    @patch('os.remove')
    @patch('os.path.exists', return_value=False)
    def test_clear_existing_token_missing(self, mock_exists, mock_remove):
        # Arrange
        token_file = 'fake_token.json'
        
        # Act
        result = run.clear_existing_token(token_file)
        
        # Assert
        mock_remove.assert_not_called()
        self.assertFalse(result)


    @patch('os.remove')
    @patch('os.path.exists', return_value=True)
    def test_clear_existing_token_exist(self, mock_exists, mock_remove):
        # Arrange
        token_file = 'fake_token.json'
        
        # Act
        result = run.clear_existing_token(token_file)
        
        # Assert
        mock_remove.assert_called_once_with('fake_token.json')
        self.assertTrue(result)


    @patch('run.google_auth_oauthlib.flow.InstalledAppFlow')
    def test_create_oauth_flow(self, mock_flow_class):
        # Arrange
        mock_flow_instance = Mock()
        mock_credentials = Mock()
        mock_flow_class.from_client_secrets_file.return_value = mock_flow_instance
        mock_flow_instance.run_local_server.return_value = mock_credentials
        client_secrets_file = 'test_secrets.json'
        scopes = ['https://www.googleapis.com/auth/youtube.upload']
        
        # Act
        result = run.create_oauth_flow(client_secrets_file, scopes)
        
        # Assert
        mock_flow_class.from_client_secrets_file.assert_called_once_with(
            client_secrets_file, scopes)
        mock_flow_instance.run_local_server.assert_called_once()
        self.assertEqual(result, mock_credentials)


    @patch('run.discovery.build')
    def test_build_youtube_client(self, mock_discovery_build):
        # Arrange
        mock_credentials = Mock()
        mock_youtube_client = Mock()
        mock_discovery_build.return_value = mock_youtube_client
        
        # Act
        result = run.build_youtube_client(mock_credentials)
        
        # Assert
        mock_discovery_build.assert_called_once_with("youtube", "v3", credentials=mock_credentials)
        self.assertEqual(result, mock_youtube_client)


    def test_authenticate_youtube(self):
        # Arrange
        mock_credentials = Mock()
        mock_youtube_client = Mock()
        
        # Act
        with patch('run.clear_existing_token') as mock_clear_token, \
             patch('run.create_oauth_flow', return_value=mock_credentials) as mock_create_flow, \
             patch('run.build_youtube_client', return_value=mock_youtube_client) as mock_build_client:
            
            result = run.authenticate_youtube()
        
        # Assert
        mock_clear_token.assert_called_once()
        mock_create_flow.assert_called_once()
        mock_build_client.assert_called_once_with(mock_credentials)
        self.assertEqual(result, mock_youtube_client)

    
    @patch('run.read_json_file')
    def test_parse_json_file(self, mock_read_json):
        # Arrange
        json_file = 'test.json'
        expected_data = [{'test': 'data'}]
        mock_read_json.return_value = expected_data
        
        # Act
        result = run.parse_json_file(json_file)
        
        # Assert
        mock_read_json.assert_called_once_with(json_file)
        self.assertEqual(result, expected_data)

    
    def test_extract_video_filename_success(self):
        # Arrange
        entry = {
            'label_values': [
                {
                    'label': 'Video',
                    'media': [{'uri': 'path/to/video/test_video.mp4'}]
                }
            ]
        }
        
        # Act
        result = run.extract_video_filename(entry)
        
        # Assert
        self.assertEqual(result, 'test_video.mp4')


    def test_extract_video_filename_no_video_label(self):
        # Arrange
        entry = {
            'label_values': [
                {'label': 'Other', 'value': 'something'}
            ]
        }
        
        # Act
        result = run.extract_video_filename(entry)
        
        # Assert
        self.assertIsNone(result)


    def test_extract_video_filename_no_media(self):
        # Arrange
        entry = {
            'label_values': [
                {'label': 'Video', 'media': []}
            ]
        }
        
        # Act
        result = run.extract_video_filename(entry)
        
        # Assert
        self.assertIsNone(result)


    def test_extract_video_filename_no_uri(self):
        # Arrange
        entry = {
            'label_values': [
                {'label': 'Video', 'media': [{}]}
            ]
        }
        
        # Act
        result = run.extract_video_filename(entry)
        
        # Assert
        self.assertIsNone(result)

    
    @patch('run.extract_label_value')
    def test_extract_video_title_found(self, mock_extract_label):
        # Arrange
        entry = {'test': 'entry'}
        mock_extract_label.return_value = 'Test Video Title'
        
        # Act
        result = run.extract_video_title(entry)
        
        # Assert
        mock_extract_label.assert_called_once_with(entry, 'Title')
        self.assertEqual(result, 'Test Video Title')


    @patch('run.extract_label_value')
    @patch('run.default_title', 'Default Title')
    def test_extract_video_title_uses_default(self, mock_extract_label):
        # Arrange
        entry = {'test': 'entry'}
        mock_extract_label.return_value = None
        
        # Act
        result = run.extract_video_title(entry)
        
        # Assert
        mock_extract_label.assert_called_once_with(entry, 'Title')
        self.assertEqual(result, run.default_title)

    
    @patch('run.extract_video_title')
    @patch('run.extract_video_filename')
    @patch('run.parse_json_file')
    def test_build_title_map(self, mock_parse_json, mock_extract_filename, mock_extract_title):
        # Arrange
        json_file = 'test.json'
        mock_entries = [
            {'entry': '1'},
            {'entry': '2'},
            {'entry': '3'}
        ]
        mock_parse_json.return_value = mock_entries
        mock_extract_filename.side_effect = ['video1.mp4', None, 'video3.mp4']  # None for entry 2
        mock_extract_title.side_effect = ['Title 1', 'Title 3']  
        
        # Act
        result = run.build_title_map(json_file)
        
        # Assert
        mock_parse_json.assert_called_once_with(json_file)
        self.assertEqual(mock_extract_filename.call_count, 3)
        self.assertEqual(mock_extract_title.call_count, 2)  # Only called for valid filenames
        
        expected_map = {
            'video1.mp4': 'Title 1',
            'video3.mp4': 'Title 3'
        }
        self.assertEqual(result, expected_map)

    
    @patch('builtins.print')
    @patch('run.sorted')
    def test_get_pending_videos(self, mock_sorted, mock_print):
        # Arrange
        videos_dir = 'test_dir'
        uploaded_list = ['uploaded.mp4']
        title_map = {'new.mp4': 'New Video', 'uploaded.mp4': 'Uploaded Video'}
        mock_files = ['new.mp4', 'uploaded.mp4', 'notitle.mp4', 'document.txt']
        mock_sorted.return_value = mock_files
        
        # Act
        with patch('run.os.listdir', return_value=mock_files):
            result = run.get_pending_videos(videos_dir, uploaded_list, title_map)
        
        # Assert
        expected_pending = ['new.mp4']
        self.assertEqual(result, expected_pending)
        mock_print.assert_called_once_with("Skipping notitle.mp4: no title found in JSON metadata")

    
    @patch('run.googleapiclient.http.MediaFileUpload')
    def test_make_upload_request(self, mock_media_upload):
        # Arrange
        mock_youtube = Mock()
        media_file = 'test_video.mp4'
        title = 'Test Title'
        mock_media_body = Mock()
        mock_media_upload.return_value = mock_media_body
        mock_request = Mock()
        mock_youtube.videos.return_value.insert.return_value = mock_request
        
        # Act
        result = run.make_upload_request(mock_youtube, media_file, title)
        
        # Assert
        mock_media_upload.assert_called_once_with(media_file, chunksize=-1, resumable=True)
        mock_youtube.videos.assert_called_once()
        mock_youtube.videos.return_value.insert.assert_called_once_with(
            part="snippet,status",
            body={
                "snippet": {"categoryId": run.youtube_category_id, "title": title},
                "status": {"privacyStatus": "public"}
            },
            media_body=mock_media_body
        )
        self.assertEqual(result, mock_request)

    
    @patch('builtins.print')
    def test_perform_resumable_upload(self, mock_print):
        # Arrange
        mock_request = Mock()
        title = 'Test Title'
        mock_status = Mock()
        mock_status.progress.return_value = 0.5
        mock_response = {'id': 'test_video_id'}
        mock_request.next_chunk.side_effect = [
            (mock_status, None),  
            (None, mock_response)  
        ]
        
        # Act
        result = run.perform_resumable_upload(mock_request, title)
        
        # Assert
        self.assertEqual(result, mock_response)
        mock_print.assert_called_once_with("Uploading 'Test Title': 50%")

    
    @patch('builtins.print')
    @patch('run.perform_resumable_upload')
    @patch('run.make_upload_request')
    def test_upload_single_video(self, mock_make_request, mock_perform_upload, mock_print):
        # Arrange
        mock_youtube = Mock()
        media_file = 'test_video.mp4'
        title = 'Test Title'
        mock_request = Mock()
        mock_response = {'id': 'test_video_id'}
        mock_make_request.return_value = mock_request
        mock_perform_upload.return_value = mock_response
        
        # Act
        run.upload_single_video(mock_youtube, media_file, title)
        
        # Assert
        mock_make_request.assert_called_once_with(mock_youtube, media_file, title)
        mock_perform_upload.assert_called_once_with(mock_request, title)
        mock_print.assert_called_once_with("Uploaded 'Test Title' with ID: test_video_id")

    
    @patch('run.upload_single_video')
    @patch('run.get_videos_directory')
    def test_upload_videos(self, mock_get_videos_dir, mock_upload_single):
        # Arrange
        mock_youtube = Mock()
        base_dir = 'test_base'
        pending = ['video1.mp4', 'video2.mp4', 'video3.mp4']
        title_map = {'video1.mp4': 'Title 1', 'video2.mp4': 'Title 2', 'video3.mp4': 'Title 3'}
        uploaded_list = []
        videos_dir = 'test_base/videos'
        mock_get_videos_dir.return_value = videos_dir
        
        # Act
        with patch('run.os.path.join', side_effect=lambda *args: '/'.join(args)):
            run.upload_videos(mock_youtube, base_dir, pending, title_map, uploaded_list)
        
        # Assert
        self.assertEqual(mock_upload_single.call_count, 3)
        mock_upload_single.assert_any_call(mock_youtube, 'test_base/videos/video1.mp4', 'Title 1')
        mock_upload_single.assert_any_call(mock_youtube, 'test_base/videos/video2.mp4', 'Title 2')
        mock_upload_single.assert_any_call(mock_youtube, 'test_base/videos/video3.mp4', 'Title 3')
        self.assertEqual(uploaded_list, ['video1.mp4', 'video2.mp4', 'video3.mp4'])

    
    @patch('run.read_json_file')
    def test_initialize_registry_exists(self, mock_read_json):
        # Arrange
        base_dir = 'test_base'
        mock_uploaded_list = ['video1.mp4', 'video2.mp4']
        mock_read_json.return_value = mock_uploaded_list
        
        # Act
        with patch('run.os.path.exists', return_value=True), \
             patch('run.os.path.join', return_value='test_base/uploaded_registry.json'):
            registry_file, uploaded_list = run.initialize_registry(base_dir)
        
        # Assert
        self.assertEqual(registry_file, 'test_base/uploaded_registry.json')
        self.assertEqual(uploaded_list, mock_uploaded_list)
        mock_read_json.assert_called_once_with('test_base/uploaded_registry.json')


    def test_initialize_registry_not_exists(self):
        # Arrange
        base_dir = 'test_base'
        
        # Act
        with patch('run.os.path.exists', return_value=False), \
             patch('run.os.path.join', return_value='test_base/uploaded_registry.json'):
            registry_file, uploaded_list = run.initialize_registry(base_dir)
        
        # Assert
        self.assertEqual(registry_file, 'test_base/uploaded_registry.json')
        self.assertEqual(uploaded_list, [])

    
    @patch('builtins.open')
    @patch('json.dump')
    def test_save_registry(self, mock_json_dump, mock_open):
        # Arrange
        registry_file = 'test_registry.json'
        uploaded_list = ['video1.mp4', 'video2.mp4']
        mock_file = Mock()
        mock_open.return_value.__enter__.return_value = mock_file
        
        # Act
        run.save_registry(registry_file, uploaded_list)
        
        # Assert
        mock_open.assert_called_once_with(registry_file, 'w', encoding='utf-8')
        mock_json_dump.assert_called_once_with(uploaded_list, mock_file, indent=2)

    
    @patch('builtins.print')
    @patch('run.upload_videos')
    def test_handle_video_upload_process_no_videos(self, mock_upload_videos, mock_print):
        # Arrange
        mock_youtube = Mock()
        facebook_data_dir = 'test_dir'
        pending = []  
        title_map = {}
        uploaded_list = ['old_video.mp4']
        videos_dir = 'test_dir/videos'
        
        # Act
        run.handle_video_upload_process(mock_youtube, facebook_data_dir, pending, title_map, uploaded_list, videos_dir)
        
        # Assert
        mock_upload_videos.assert_not_called()
        expected_calls = [
            unittest.mock.call("No videos to upload - All videos have already been uploaded or no new videos found."),
            unittest.mock.call("Videos directory: test_dir/videos"),
            unittest.mock.call("Total videos in registry: 1"),
            unittest.mock.call("Total videos with metadata: 0")
        ]
        mock_print.assert_has_calls(expected_calls)


    @patch('builtins.print')
    @patch('run.upload_videos')
    def test_handle_video_upload_process_with_videos(self, mock_upload_videos, mock_print):
        # Arrange
        mock_youtube = Mock()
        facebook_data_dir = 'test_dir'
        pending = ['video1.mp4']
        title_map = {'video1.mp4': 'Title 1'}
        uploaded_list = []
        videos_dir = 'test_dir/videos'
        
        # Act
        run.handle_video_upload_process(mock_youtube, facebook_data_dir, pending, title_map, uploaded_list, videos_dir)
        
        # Assert
        mock_upload_videos.assert_called_once_with(mock_youtube, facebook_data_dir, pending, title_map, uploaded_list)
        expected_calls = [
            unittest.mock.call("Found 1 video to upload"),
            unittest.mock.call("Upload process completed")
        ]
        mock_print.assert_has_calls(expected_calls)

class TestDailyLimitAndResume(unittest.TestCase):
    """Tests for daily upload limit enforcement and resume workflow."""

    def test_can_upload_today_under_limit(self):
        """When daily count is under limit, can_upload_today returns True."""
        registry = {
            "uploaded_fbids": [],
            "processed_zips": [],
            "daily_uploads": {"2026-01-28": 3}
        }
        with patch('run.datetime') as mock_datetime:
            mock_datetime.date.today.return_value.isoformat.return_value = "2026-01-28"
            result = run.can_upload_today(registry, max_per_day=6)
        self.assertTrue(result)

    def test_can_upload_today_at_limit(self):
        """When daily count equals limit, can_upload_today returns False."""
        registry = {
            "uploaded_fbids": [],
            "processed_zips": [],
            "daily_uploads": {"2026-01-28": 6}
        }
        with patch('run.datetime') as mock_datetime:
            mock_datetime.date.today.return_value.isoformat.return_value = "2026-01-28"
            result = run.can_upload_today(registry, max_per_day=6)
        self.assertFalse(result)

    def test_can_upload_today_over_limit(self):
        """When daily count exceeds limit, can_upload_today returns False."""
        registry = {
            "uploaded_fbids": [],
            "processed_zips": [],
            "daily_uploads": {"2026-01-28": 10}
        }
        with patch('run.datetime') as mock_datetime:
            mock_datetime.date.today.return_value.isoformat.return_value = "2026-01-28"
            result = run.can_upload_today(registry, max_per_day=6)
        self.assertFalse(result)

    def test_can_upload_today_no_uploads_yet(self):
        """When no uploads today, can_upload_today returns True."""
        registry = {
            "uploaded_fbids": [],
            "processed_zips": [],
            "daily_uploads": {}
        }
        with patch('run.datetime') as mock_datetime:
            mock_datetime.date.today.return_value.isoformat.return_value = "2026-01-28"
            result = run.can_upload_today(registry, max_per_day=6)
        self.assertTrue(result)

    def test_can_upload_today_yesterday_full_today_empty(self):
        """Yesterday's full count shouldn't block today's uploads (daily reset)."""
        registry = {
            "uploaded_fbids": ["old1", "old2", "old3", "old4", "old5", "old6"],
            "processed_zips": [],
            "daily_uploads": {"2026-01-27": 6}  # Yesterday was full
        }
        with patch('run.datetime') as mock_datetime:
            mock_datetime.date.today.return_value.isoformat.return_value = "2026-01-28"  # Today
            result = run.can_upload_today(registry, max_per_day=6)
        self.assertTrue(result)  # Should allow uploads today

    def test_record_upload_adds_fbid(self):
        """record_upload adds fbid to uploaded_fbids list."""
        registry = {
            "uploaded_fbids": ["existing_fbid"],
            "processed_zips": [],
            "daily_uploads": {}
        }
        with patch('run.datetime') as mock_datetime:
            mock_datetime.date.today.return_value.isoformat.return_value = "2026-01-28"
            run.record_upload(registry, "new_fbid")

        self.assertIn("new_fbid", registry["uploaded_fbids"])
        self.assertIn("existing_fbid", registry["uploaded_fbids"])

    def test_record_upload_increments_daily_count(self):
        """record_upload increments the daily upload counter."""
        registry = {
            "uploaded_fbids": [],
            "processed_zips": [],
            "daily_uploads": {"2026-01-28": 2}
        }
        with patch('run.datetime') as mock_datetime:
            mock_datetime.date.today.return_value.isoformat.return_value = "2026-01-28"
            run.record_upload(registry, "test_fbid")

        self.assertEqual(registry["daily_uploads"]["2026-01-28"], 3)

    def test_record_upload_creates_daily_count_if_missing(self):
        """record_upload creates daily count entry if not exists."""
        registry = {
            "uploaded_fbids": [],
            "processed_zips": [],
            "daily_uploads": {}
        }
        with patch('run.datetime') as mock_datetime:
            mock_datetime.date.today.return_value.isoformat.return_value = "2026-01-28"
            run.record_upload(registry, "test_fbid")

        self.assertEqual(registry["daily_uploads"]["2026-01-28"], 1)

    def test_record_upload_prevents_duplicate_fbid(self):
        """record_upload doesn't add duplicate fbids."""
        registry = {
            "uploaded_fbids": ["existing_fbid"],
            "processed_zips": [],
            "daily_uploads": {}
        }
        with patch('run.datetime') as mock_datetime:
            mock_datetime.date.today.return_value.isoformat.return_value = "2026-01-28"
            run.record_upload(registry, "existing_fbid")

        # Should only have one instance
        self.assertEqual(registry["uploaded_fbids"].count("existing_fbid"), 1)


class TestRegistryPersistence(unittest.TestCase):
    """Tests for registry file persistence across runs."""

    def test_load_registry_creates_empty_if_missing(self):
        """load_registry returns empty structure when file doesn't exist."""
        with tempfile.TemporaryDirectory() as tmpdir:
            registry_path = os.path.join(tmpdir, "registry.json")
            result = run.load_registry(registry_path)

        self.assertEqual(result, {
            "uploaded_fbids": [],
            "processed_zips": [],
            "daily_uploads": {}
        })

    def test_load_registry_reads_existing_file(self):
        """load_registry correctly reads existing registry file."""
        with tempfile.TemporaryDirectory() as tmpdir:
            registry_path = os.path.join(tmpdir, "registry.json")
            test_data = {
                "uploaded_fbids": ["fbid1", "fbid2"],
                "processed_zips": ["zip1.zip"],
                "daily_uploads": {"2026-01-28": 2}
            }
            with open(registry_path, 'w') as f:
                json.dump(test_data, f)

            result = run.load_registry(registry_path)

        self.assertEqual(result, test_data)

    def test_load_registry_migrates_old_format(self):
        """load_registry migrates old list format to new dict format."""
        with tempfile.TemporaryDirectory() as tmpdir:
            registry_path = os.path.join(tmpdir, "registry.json")
            # Old format was just a list
            old_format = ["video1.mp4", "video2.mp4"]
            with open(registry_path, 'w') as f:
                json.dump(old_format, f)

            result = run.load_registry(registry_path)

        self.assertEqual(result["uploaded_fbids"], old_format)
        self.assertEqual(result["processed_zips"], [])
        self.assertEqual(result["daily_uploads"], {})

    def test_save_registry_atomic_writes_correctly(self):
        """save_registry_atomic writes data that can be read back."""
        with tempfile.TemporaryDirectory() as tmpdir:
            registry_path = os.path.join(tmpdir, "registry.json")
            test_data = {
                "uploaded_fbids": ["fbid1", "fbid2"],
                "processed_zips": ["zip1.zip"],
                "daily_uploads": {"2026-01-28": 2}
            }

            run.save_registry_atomic(registry_path, test_data)

            with open(registry_path, 'r') as f:
                result = json.load(f)

        self.assertEqual(result, test_data)

    def test_registry_persists_between_runs(self):
        """Registry data persists correctly between save and load cycles."""
        with tempfile.TemporaryDirectory() as tmpdir:
            registry_path = os.path.join(tmpdir, "registry.json")

            # First "run" - save some data
            registry1 = run.load_registry(registry_path)
            registry1["uploaded_fbids"].append("fbid1")
            registry1["daily_uploads"]["2026-01-28"] = 1
            run.save_registry_atomic(registry_path, registry1)

            # Second "run" - should see previous data
            registry2 = run.load_registry(registry_path)
            self.assertIn("fbid1", registry2["uploaded_fbids"])
            self.assertEqual(registry2["daily_uploads"]["2026-01-28"], 1)

            # Add more data
            registry2["uploaded_fbids"].append("fbid2")
            registry2["daily_uploads"]["2026-01-28"] = 2
            run.save_registry_atomic(registry_path, registry2)

            # Third "run" - should see all data
            registry3 = run.load_registry(registry_path)
            self.assertEqual(registry3["uploaded_fbids"], ["fbid1", "fbid2"])
            self.assertEqual(registry3["daily_uploads"]["2026-01-28"], 2)


class TestResumeWorkflow(unittest.TestCase):
    """Tests for resume workflow - skipping already uploaded videos."""

    def test_extract_fbid_from_entry(self):
        """extract_fbid correctly extracts fbid from entry."""
        entry = {
            'label_values': [
                {
                    'label': 'Video',
                    'media': [{'uri': 'path/to/123456789.mp4'}]
                }
            ]
        }
        result = run.extract_fbid(entry)
        self.assertEqual(result, "123456789")

    def test_extract_fbid_handles_uppercase_extension(self):
        """extract_fbid handles .MP4 extension."""
        entry = {
            'label_values': [
                {
                    'label': 'Video',
                    'media': [{'uri': 'path/to/123456789.MP4'}]
                }
            ]
        }
        result = run.extract_fbid(entry)
        self.assertEqual(result, "123456789")

    def test_extract_fbid_returns_none_when_missing(self):
        """extract_fbid returns None when video info is missing."""
        entry = {'label_values': []}
        result = run.extract_fbid(entry)
        self.assertIsNone(result)


if __name__ == "__main__":
    unittest.main()





