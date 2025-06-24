from dotenv import load_dotenv
import unittest
from unittest.mock import patch, Mock
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

if __name__ == "__main__":
    unittest.main()





