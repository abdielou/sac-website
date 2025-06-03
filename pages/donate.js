import Image from '@/components/Image'
import { PageSEO } from '@/components/SEO'
import siteMetadata from '@/data/siteMetadata'
import { useState, useEffect } from 'react'

export default function Contact() {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const checkByAspectRatio = () => {
        const aspectRatio = window.innerWidth / window.innerHeight;
        setIsMobile(aspectRatio < 0.8);
      };
  
      checkByAspectRatio(); 
      window.addEventListener('resize', checkByAspectRatio);
      return () => window.removeEventListener('resize', checkByAspectRatio);
    }
  }, []);

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
          <div className="visible md:invisible">
            <button
              className="inline px-4 py-2 text-sm font-medium leading-5 text-white transition-colors duration-150 bg-blue-600 border border-transparent rounded-lg shadow focus:outline-none focus:shadow-outline-blue hover:bg-blue-700 dark:hover:bg-blue-500"
              onClick={() => window.open(siteMetadata.payments.payAthMovil, '_blank')}
            >
              Donativo con AthMovil
            </button>
          </div>
          {!isMobile && (
            <div>
              <div className="pt-4 pb-4 prose dark:prose-dark max-w-none">
                También puedes hacer tu donativo con ATH Movil desde tu celular.
              </div>
              <Image
                src={siteMetadata.payments.payAthMovilQR}
                alt="SAC ATH Movil"
                width={400}
                height={452}
              />
            </div>
          )}
          <div>
            <button
              className="inline px-4 py-2 text-sm font-medium leading-5 text-white transition-colors duration-150 bg-blue-600 border border-transparent rounded-lg shadow focus:outline-none focus:shadow-outline-blue hover:bg-blue-700 dark:hover:bg-blue-500"
              onClick={() => window.open(siteMetadata.payments.donatePaypal, '_blank')}
            >
              Donativo con PayPal
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
