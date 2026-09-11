import fs from 'fs'
import path from 'path'

const FONT_FACES = [
  { filePath: path.join(process.cwd(), 'Gilroy-Regular.ttf'), weight: 400 },
  { filePath: path.join(process.cwd(), 'Gilroy-Medium.ttf'), weight: 500 },
  { filePath: path.join(process.cwd(), 'Gilroy-Bold.ttf'), weight: 700 },
  { filePath: path.join(process.cwd(), 'Gilroy-ExtraBold.ttf'), weight: 800 },
]

let fontFaceCssPromise

/**
 * Embed the exact brand font in each SVG passed to sharp/librsvg. Relying on
 * server-installed fonts made local, preview, and deployed renders disagree.
 * The promise is cached so files are read only once per server process.
 */
export function getTemplateFontFaceCss() {
  if (!fontFaceCssPromise) {
    fontFaceCssPromise = Promise.all(
      FONT_FACES.map(async ({ filePath, weight }) => {
        const fontBase64 = (await fs.promises.readFile(filePath)).toString('base64')
        return `@font-face{font-family:'Gilroy SAC';src:url(data:font/ttf;base64,${fontBase64}) format('truetype');font-style:normal;font-weight:${weight};}`
      })
    ).then((fontFaces) => fontFaces.join(''))
  }

  return fontFaceCssPromise
}
