import weatherData from '@/data/weatherData'
import Card from '@/components/Card'
import LayoutWrapper from '@/components/LayoutWrapper'

export const metadata = {
  title: 'Clima - SAC',
  description: 'Condiciones del tiempo, imágenes de satélite, radar Doppler y más',
  openGraph: {
    title: 'Clima - SAC',
    description: 'Condiciones del tiempo, imágenes de satélite, radar Doppler y más',
  },
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

export default function WeatherPage() {
  return (
    <LayoutWrapper>
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
                  imageOptimize={d.imageOptimize}
                />
              )
            })}
          </div>
        </div>
      </div>
    </LayoutWrapper>
  )
}
