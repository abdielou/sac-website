import { getMediaEntry } from '@/lib/media-s3'

// These tests verify the API responses without needing real S3
describe('media API', () => {
  describe('meta endpoint', () => {
    it('getMediaEntry returns null for non-existent slug', async () => {
      const result = await getMediaEntry('nonexistent-video')
      expect(result).toBeNull()
    })
  })
})