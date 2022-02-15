import { parse } from 'rss-to-json'
import NodeCache from 'node-cache'

const cache = new NodeCache({
  stdTTL: 6 * 60 * 60, // 6 hours
  checkperiod: 2 * 60 * 60, // 2 hours
})
const NASA_APOD_RSS_URL = 'https://apod.nasa.gov/apod.rss'

// eslint-disable-next-line import/no-anonymous-default-export
export default async (req, res) => {
  try {
    const latest = await getLatestImage()
    const imgSrc = extractImgSrc(latest.description)
    const alt = extractAlt(latest.description)
    const apod = {
      imgSrc,
      title: latest.title,
      href: latest.link,
      alt,
    }
    return res.status(200).json(apod)
  } catch (error) {
    return res.status(500).json({
      error: 'Something went wrong',
    })
  }
}

async function getLatestImage() {
  if (!cache.getTtl(NASA_APOD_RSS_URL)) {
    const { items } = await parse(NASA_APOD_RSS_URL)
    const latest = items[0]
    cache.set(NASA_APOD_RSS_URL, latest)
  }
  const latest = cache.get(NASA_APOD_RSS_URL)
  return latest
}

function extractAlt(string) {
  const altRegex = /alt="(.+)" border/
  const alt = string.match(altRegex)[1]
  return alt
}

function extractImgSrc(string) {
  const imgSrcRegex = /src="(https:\/\/apod\.nasa\.gov\/apod\/calendar\/S_\d+\.jpg)"/
  const imgSrc = string.match(imgSrcRegex)[1]
  return imgSrc
}
