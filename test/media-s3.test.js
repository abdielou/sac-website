import { getMediaIndex, getMediaEntry } from '@/lib/media-s3'

describe('media-s3', () => {
  describe('getMediaIndex', () => {
    it('returns empty index when bucket not configured', async () => {
      // This test verifies the function handles missing bucket gracefully
      const result = await getMediaIndex()
      expect(result).toEqual({ media: [], updatedAt: null })
    })
  })

  describe('getMediaEntry', () => {
    it('returns null for non-existent slug', async () => {
      const result = await getMediaEntry('nonexistent')
      expect(result).toBeNull()
    })
  })
})