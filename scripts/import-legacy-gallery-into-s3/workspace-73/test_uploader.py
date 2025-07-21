from dotenv import load_dotenv
import unittest
from unittest.mock import patch, mock_open, Mock
from datetime import datetime
import uploader
load_dotenv()

class TestUploader(unittest.TestCase):
    @patch('uploader.os.path.join', return_value='images/photos/photo.jpg')
    @patch('uploader.os.path.isfile', return_value=True)
    # Tests that get_file_path returns the correct path when the file exists
    def test_get_file_path_exists(self, mock_isfile, mock_join):
        # Arrange
        entry = {'photo_url': 'photo.jpg'}
        # Act
        result = uploader.get_file_path(entry)
        # Assert
        mock_join.assert_called_once_with(uploader.IMAGES_DIR, 'photo.jpg')
        self.assertEqual(result, 'images/photos/photo.jpg')

    @patch('uploader.os.path.join', return_value='images/photos/missing.jpg')
    @patch('uploader.os.path.isfile', return_value=False)
    @patch('builtins.print')
    # Tests that get_file_path skips when no photo_url or file missing
    def test_get_file_path_missing(self, mock_print, mock_isfile, mock_join):
        # Arrange
        entry = {'photo_url': 'missing.jpg'}
        # Act
        result = uploader.get_file_path(entry)
        # Assert
        mock_print.assert_called_once_with('[SKIP] File not found: images/photos/missing.jpg')
        self.assertIsNone(result)

    def test_get_datetime_valid(self):
        # Arrange
        entry = {'date': '2020-01-02'}
        # Act
        dt = uploader.get_datetime(entry, 'file')
        # Assert
        self.assertEqual(dt, datetime.strptime('2020-01-02', '%Y-%m-%d'))

    @patch('builtins.print')
    # Tests that get_datetime skips when date is missing
    def test_get_datetime_no_date(self, mock_print):
        # Arrange
        entry = {}
        # Act
        result = uploader.get_datetime(entry, 'file')
        # Assert
        mock_print.assert_called_once_with('[SKIP] No date for file: file')
        self.assertIsNone(result)

    @patch('builtins.print')
    # Tests that get_datetime skips on invalid date format
    def test_get_datetime_invalid(self, mock_print):
        # Arrange
        entry = {'date': 'bad'}
        # Act
        result = uploader.get_datetime(entry, 'file')
        # Assert
        mock_print.assert_called_once_with('[SKIP] Invalid date format for file: bad')
        self.assertIsNone(result)

    def test_make_key(self):
        # Arrange
        dt_obj = datetime(1970, 1, 1)
        # Act
        key = uploader.make_key(dt_obj)
        # Assert
        self.assertEqual(key, '0')

    def test_make_metadata(self):
        # Arrange
        entry = {'title': 'áé', 'description': 'ñç'}
        # Act
        meta = uploader.make_metadata(entry)
        # Assert
        self.assertEqual(meta['title'], 'ae')
        self.assertEqual(meta['description'], 'nc')

    def test_make_metadata_trueDate_exact(self):
        # Arrange
        entry = {'title': 't', 'description': 'd', 'date': '2020-01-02'}
        # Act
        meta = uploader.make_metadata(entry)
        # Assert
        self.assertEqual(meta['TrueDate'], 'true')

    def test_make_metadata_trueDate_approx(self):
        # Arrange
        entry = {'title': 't', 'description': 'd', 'aprox-date': '2021-02-03'}
        # Act
        meta = uploader.make_metadata(entry)
        # Assert
        self.assertEqual(meta['TrueDate'], 'false')

    @patch('builtins.open', new_callable=mock_open, read_data=b'data')
    # Tests that read_data reads binary data from file
    def test_read_data(self, mock_file):
        # Arrange
        file_path = 'file.bin'
        # Act
        result = uploader.read_data(file_path)
        # Assert
        mock_file.assert_called_once_with(file_path, 'rb')
        self.assertEqual(result, b'data')

    @patch('boto3.client')
    # Tests that init_s3_client uses module constants for configuration
    def test_init_s3_client(self, mock_client):
        # Arrange
        uploader.S3_ENDPOINT_URL = 'endpoint'
        uploader.AWS_ACCESS_KEY_ID = 'id'
        uploader.AWS_SECRET_ACCESS_KEY = 'secret'
        # Act
        client = uploader.init_s3_client()
        # Assert
        mock_client.assert_called_once_with(
            's3', endpoint_url='endpoint', aws_access_key_id='id', aws_secret_access_key='secret'
        )

    @patch('builtins.print')
    # Tests that upload_object logs success and calls put_object correctly
    def test_upload_object_success(self, mock_print):
        # Arrange
        mock_s3 = Mock()
        # Act
        uploader.upload_object(mock_s3, 'bucket', 'key', b'data', {'title': 't', 'description': 'd'}, 'file')
        # Assert
        mock_s3.put_object.assert_called_once_with(
            Bucket='bucket', Key='key', Body=b'data', Metadata={'title':'t','description':'d'}, ContentType='image/jpeg'
        )
        mock_print.assert_called_once_with('[OK] Uploaded file to bucket/key')

    @patch('builtins.print')
    # Tests that upload_object logs an error when put_object raises
    def test_upload_object_error(self, mock_print):
        # Arrange
        mock_s3 = Mock()
        mock_s3.put_object.side_effect = Exception('oops')
        # Act
        uploader.upload_object(mock_s3, 'bucket', 'key', b'data', {'title': 't', 'description': 'd'}, 'file')
        # Assert
        mock_print.assert_called_once_with('[ERROR] Failed to upload file: oops')

    @patch('builtins.print')
    # Tests that get_file_path handles entries without photo_url
    def test_get_file_path_no_photo(self, mock_print):
        # Arrange
        entry = {}
        # Act
        result = uploader.get_file_path(entry)
        # Assert
        mock_print.assert_called_once_with('[SKIP] File not found: ')
        self.assertIsNone(result)

    def test_ensure_bucket_success(self):
        # Arrange
        mock_s3 = Mock()
        mock_s3.exceptions = Mock()
        # Act
        uploader.ensure_bucket(mock_s3, 'bucket')
        # Assert
        mock_s3.create_bucket.assert_called_once_with(Bucket='bucket')

    def test_ensure_bucket_already_owned(self):
        # Arrange
        mock_s3 = Mock()
        class E(Exception): pass
        mock_s3.exceptions = Mock()
        mock_s3.exceptions.BucketAlreadyOwnedByYou = E
        mock_s3.exceptions.BucketAlreadyExists = E
        mock_s3.create_bucket.side_effect = E()
        # Act / Assert (no exception)
        uploader.ensure_bucket(mock_s3, 'bucket')
        mock_s3.create_bucket.assert_called_once()

    def test_ensure_bucket_other_error(self):
        # Arrange
        mock_s3 = Mock()
        mock_s3.exceptions = Mock()
        class Owned(Exception): pass
        mock_s3.exceptions.BucketAlreadyOwnedByYou = Owned
        mock_s3.exceptions.BucketAlreadyExists = Owned
        mock_s3.create_bucket.side_effect = RuntimeError('fail')
        # Act / Assert
        with self.assertRaises(RuntimeError):
            uploader.ensure_bucket(mock_s3, 'bucket')

    @patch('uploader.get_file_path', return_value='file')
    # Tests full upload_entry orchestration with helpers mocked
    @patch('uploader.get_datetime', return_value=datetime(2020,1,2))
    @patch('uploader.make_key', return_value='1234')
    @patch('uploader.make_metadata', return_value={'title':'t','description':'d'})
    @patch('uploader.read_data', return_value=b'data')
    @patch('uploader.upload_object')
    def test_upload_entry_full(self, mock_upload_obj, mock_read_data, mock_make_metadata, mock_make_key, mock_get_datetime, mock_get_file_path):
        # Arrange
        mock_s3 = Mock()
        entry = {'photo_url': 'file'}
        # Act
        uploader.upload_entry(mock_s3, 'bucket', entry)
        # Assert
        mock_get_file_path.assert_called_once_with(entry)
        mock_get_datetime.assert_called_once_with(entry, 'file')
        mock_make_key.assert_called_once_with(mock_get_datetime.return_value)
        mock_make_metadata.assert_called_once_with(entry)
        mock_read_data.assert_called_once_with('file')
        mock_upload_obj.assert_called_once_with(mock_s3, 'bucket', '1234', b'data', {'title':'t','description':'d'}, 'file')

    @patch('builtins.open', new_callable=mock_open, read_data='[{}]')
    # Tests main function initializes client, ensures bucket, and processes entries
    @patch('json.load', return_value=[{'photo_url':'file','date':'2020-01-02'}])
    @patch('uploader.init_s3_client')
    @patch('uploader.ensure_bucket')
    @patch('uploader.upload_entry')
    def test_main(self, mock_upload_entry, mock_ensure_bucket, mock_init_s3, mock_json_load, mock_open_file):
        # Arrange
        mock_s3 = Mock()
        mock_init_s3.return_value = mock_s3
        uploader.BUCKET_NAME = 'bucket'
        # Act
        uploader.main()
        # Assert
        mock_init_s3.assert_called_once()
        mock_ensure_bucket.assert_called_once_with(mock_s3, 'bucket')
        mock_upload_entry.assert_called_once_with(mock_s3, 'bucket', mock_json_load.return_value[0])

if __name__ == '__main__':
    unittest.main() 