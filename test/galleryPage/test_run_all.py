import os
import json
import pytest
import run
from pathlib import Path

# Fixtures and helpers for upload tests
def test_build_title_map():
    # Uses the real live_videos.json
    title_map = run.build_title_map(run.JSON_FILE)
    assert isinstance(title_map, dict)
    # There should be at least one video mapping (at least one video in the sample)
    assert title_map
    # Keys should be .mp4 filenames, values should be strings
    for fn, title in title_map.items():
        assert isinstance(fn, str) and fn.lower().endswith('.mp4')
        assert isinstance(title, str)

@pytest.mark.parametrize("uploaded_count", [0, 1, 3, 100])
def test_get_pending_videos(uploaded_count):
    # Use the real facebook-sociedadastronomia/your_facebook_activity/live_videos folder
    sample_dir = run.SAMPLE_DIR
    videos_dir = os.path.join(sample_dir, 'your_facebook_activity', 'live_videos')
    title_map = run.build_title_map(run.JSON_FILE)
    # Simulate some already uploaded (first N items)
    all_files = sorted(f for f in os.listdir(videos_dir) if f.lower().endswith('.mp4'))
    uploaded = all_files[:uploaded_count]
    pending = run.get_pending_videos(videos_dir, uploaded, title_map)
    # pending should be the rest of files that exist in title_map
    expected = [f for f in all_files if f not in uploaded and f in title_map]
    assert pending == expected


def test_initialize_and_save_registry(tmp_path):
    base_dir = tmp_path / 'test_base'
    base_dir.mkdir()
    registry_file, uploaded_list = run.initialize_registry(str(base_dir))
    # New registry should start empty
    assert uploaded_list == []
    sample = ['a.mp4', 'b.mp4']
    # Save and re-read
    run.save_registry(registry_file, sample)
    _, uploaded_list2 = run.initialize_registry(str(base_dir))
    assert uploaded_list2 == sample

# Helpers for mocking a resumable upload
class DummyStatus:
    def __init__(self, progress): self._progress = progress
    def progress(self): return self._progress

class DummyRequest:
    def __init__(self): self.chunks = [(DummyStatus(0.5), None), (None, {'id': 'XYZ'})]
    def next_chunk(self): return self.chunks.pop(0)

class DummyVideos:
    def insert(self, **kwargs): return DummyRequest()

class DummyYoutube:
    def videos(self): return DummyVideos()


def test_upload_single_video(monkeypatch, capsys, tmp_path):
    # Create a small dummy media file
    media = tmp_path / 'v.mp4'
    media.write_text('x')
    yt = DummyYoutube()
    # Stub out MediaFileUpload so it does nothing
    monkeypatch.setattr('googleapiclient.http.MediaFileUpload', lambda path, chunksize, resumable: None)
    # Perform upload
    run.upload_single_video(yt, str(media), 'TestTitle')
    out = capsys.readouterr().out
    assert "Uploading 'TestTitle': 50%" in out
    assert "Uploaded 'TestTitle' with ID: XYZ" in out


def test_upload_videos(monkeypatch, tmp_path):
    # Prepare a base_dir with a couple of video files
    base = tmp_path / 'base'
    videos = base / 'your_facebook_activity' / 'live_videos'
    videos.mkdir(parents=True)
    files = ['one.mp4', 'two.mp4', 'skip.txt']
    for f in files:
        (videos / f).write_text('d')
    # Pending should only include mp4 files with titles
    pending = ['one.mp4', 'two.mp4']
    title_map = {'one.mp4': 'T1', 'two.mp4': 'T2'}
    uploaded = []
    calls = []
    # Monkeypatch upload_single_video
    monkeypatch.setattr(run, 'upload_single_video', lambda yt, mf, t: calls.append((mf, t)))
    # Run upload_videos with max_per_run=1
    run.upload_videos('yt', str(base), pending, title_map, uploaded, max_per_run=1)
    # Only one call should have happened, and uploaded list updated
    assert len(calls) == 1
    assert uploaded == ['one.mp4']

# Test that the registry skips already uploaded videos
def test_registry_skips_already_uploaded(tmp_path):
    # 1) Set up a fake directory with two videos
    base_dir = tmp_path / 'base'
    videos_dir = base_dir / 'your_facebook_activity' / 'live_videos'
    videos_dir.mkdir(parents=True)
    for fname in ['one.mp4', 'two.mp4']:
        (videos_dir / fname).write_text('data')

    # 2) Pre-populate the registry with 'one.mp4'
    reg_file = base_dir / 'uploaded_registry.json'
    reg_file.write_text(json.dumps(['one.mp4']))

    # 3) Initialize (reads that registry)
    registry_path, uploaded_list = run.initialize_registry(str(base_dir))
    assert uploaded_list == ['one.mp4']

    # 4) Build a minimal title map for both files
    title_map = {'one.mp4': 'T1', 'two.mp4': 'T2'}

    # 5) Call get_pending_videos → should only return ['two.mp4']
    pending = run.get_pending_videos(str(videos_dir), uploaded_list, title_map)
    assert pending == ['two.mp4'] 