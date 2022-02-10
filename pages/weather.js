import siteMetadata from '@/data/siteMetadata'
import weatherData from '@/data/weatherData'
import Card from '@/components/Card'
import { PageSEO } from '@/components/SEO'

export default function Projects() {
  return (
    <>
      <PageSEO title={`Clima - ${siteMetadata.author}`} description={siteMetadata.description} />
      <div className="divide-y divide-gray-200 dark:divide-gray-700">
        <div className="pt-6 pb-8 space-y-2 md:space-y-5">
          <h1 className="text-3xl font-extrabold leading-9 tracking-tight text-gray-900 dark:text-gray-100 sm:text-4xl sm:leading-10 md:text-6xl md:leading-14">
            Condiciones del Tiempo
          </h1>
        </div>
        <div className="container py-12">
          <div className="grid grid-cols-1 -m-4">
            {weatherData.map((d) => {
              const adjustedSize = _getAdjustedSize(d.width, d.height)
              return (
                <Card
                  key={d.title}
                  title={d.title}
                  description={d.description}
                  imgSrc={d.imgSrc}
                  href={d.href}
                  width={adjustedSize.width}
                  height={adjustedSize.height}
                />
              )
            })}
          </div>
        </div>
      </div>
    </>
  )
}

function _getAdjustedSize(width, height) {
  return {
    width: width / _sizeMultiplier(width),
    height: height / _sizeMultiplier(width),
  }
}
function _sizeMultiplier(width) {
  return width / 1020
}
