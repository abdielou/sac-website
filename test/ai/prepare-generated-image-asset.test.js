import sharp from 'sharp'
import { SOCIAL_CANVAS } from '../../lib/social-template/platformCanvas'
import { normalizeGeneratedImageAsset } from '../../lib/social-template/prepareGeneratedImageAsset'

function pixelAt(data, info, x, y) {
  const offset = (y * info.width + x) * info.channels
  return {
    red: data[offset],
    green: data[offset + 1],
    blue: data[offset + 2],
  }
}

describe('normalizeGeneratedImageAsset', () => {
  test('preserves edge content when the provider returns the wrong aspect ratio', async () => {
    const source = await sharp(
      Buffer.from(`
        <svg width="400" height="400" xmlns="http://www.w3.org/2000/svg">
          <rect width="400" height="400" fill="#00ff00" />
          <rect width="40" height="400" fill="#ff0000" />
          <rect x="360" width="40" height="400" fill="#0000ff" />
        </svg>
      `)
    )
      .png()
      .toBuffer()

    const normalized = await normalizeGeneratedImageAsset({
      dataUrl: `data:image/png;base64,${source.toString('base64')}`,
      downloadFileName: 'draft.png',
    })
    const output = Buffer.from(
      normalized.dataUrl.replace(/^data:image\/jpeg;base64,/, ''),
      'base64'
    )
    const { data, info } = await sharp(output).raw().toBuffer({ resolveWithObject: true })

    expect(info.width).toBe(SOCIAL_CANVAS.width)
    expect(info.height).toBe(SOCIAL_CANVAS.height)
    expect(pixelAt(data, info, 20, 720).red).toBeGreaterThan(200)
    expect(pixelAt(data, info, 1060, 720).blue).toBeGreaterThan(200)
    const paddingPixel = pixelAt(data, info, 540, 20)
    expect(paddingPixel.red).toBeLessThan(40)
    expect(paddingPixel.green).toBeLessThan(40)
    expect(paddingPixel.blue).toBeLessThan(60)
    expect(normalized.downloadFileName).toBe('draft.jpg')
  })
})
