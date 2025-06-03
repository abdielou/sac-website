import Image from '@/components/Image'
import { PageSEO } from '@/components/SEO'
import siteMetadata from '@/data/siteMetadata'
import { useEffect, useState } from 'react'

export default function Contact() {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    // Function to check if device is mobile
    const checkMobile = () => {
      // Check window width
      const isMobileWidth = window.innerWidth < 768
      // Check user agent
      const userAgent = navigator.userAgent || navigator.vendor || window.opera
      const isMobileDevice = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent.toLowerCase())
      
      // Set mobile if either condition is true
      setIsMobile(isMobileWidth || isMobileDevice)
    }

    // Check on initial load
    checkMobile()

    // Add resize listener to update on window resize
    window.addEventListener('resize', checkMobile)

    // Cleanup
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  return (
    <>
      <PageSEO
        title="Donaciones"
        description="Sea parte del esfuerzo de la Sociedad de Astronomía del Caribe"
      />
      <div className="divide-y divide-gray-200 dark:divide-gray-700">
        <div className="pt-6 pb-8 space-y-2 md:space-y-5">
          <h1 className="text-3xl font-extrabold leading-9 tracking-tight text-gray-900 dark:text-gray-100 sm:text-4xl sm:leading-10 md:text-6xl md:leading-14">
            Donaciones
          </h1>
        </div>
        <div className="items-start space-y-2 py-4 xl:grid xl:grid-cols-1 xl:gap-x-8 xl:space-y-0">
          <h2 className="text-sm tracking-tight leading-5 text-gray-800 dark:text-gray-200 sm:text-lg sm:leading-6 md:text-xl md:leading-8">
            Sea parte del esfuerzo de la Sociedad de Astronomía del Caribe
          </h2>
          <div className="pt-4 pb-4 prose dark:prose-dark max-w-none">
            La Sociedad de Astronomía del Caribe es una organización sin fines de lucro 501(c)(3)
            que ofrece varias actividades educativas y de observación astronómica durante el año en
            diversas partes de la isla, libre de costo. Con tu donativo ayudas a la SAC a cumplir
            sus misión de difundir la ciencia de la astronomía en Puerto Rico, el Caribe y el mundo.
          </div>
          
          {isMobile ? (
            // Mobile View - Only Buttons
            <div className="space-y-4">
              <button
                className="w-full px-4 py-2 text-sm font-medium leading-5 text-white transition-colors duration-150 bg-blue-600 border border-transparent rounded-lg shadow focus:outline-none focus:shadow-outline-blue hover:bg-blue-700 dark:hover:bg-blue-500"
                onClick={() => window.open(siteMetadata.payments.payAthMovil, '_blank')}
              >
                Donativo con AthMovil
              </button>
              <button
                className="w-full px-4 py-2 text-sm font-medium leading-5 text-white transition-colors duration-150 bg-blue-600 border border-transparent rounded-lg shadow focus:outline-none focus:shadow-outline-blue hover:bg-blue-700 dark:hover:bg-blue-500"
                onClick={() => window.open(siteMetadata.payments.donatePaypal, '_blank')}
              >
                Donativo con PayPal
              </button>
            </div>
          ) : (
            // Desktop View - QR and PayPal Button
            <div className="space-y-6">
              <div className="flex flex-col items-center space-y-4">
                <div className="w-full max-w-md">
                  <Image
                    src={siteMetadata.payments.payAthMovilQR}
                    alt="SAC ATH Movil"
                    width={400}
                    height={452}
                    className="w-full h-auto"
                  />
                </div>
                <p className="text-center">También puedes hacer tu donativo con ATH Movil desde tu celular.</p>
                <button
                  className="px-4 py-2 text-sm font-medium leading-5 text-white transition-colors duration-150 bg-blue-600 border border-transparent rounded-lg shadow focus:outline-none focus:shadow-outline-blue hover:bg-blue-700 dark:hover:bg-blue-500"
                  onClick={() => window.open(siteMetadata.payments.donatePaypal, '_blank')}
                >
                  Donativo con PayPal
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}







