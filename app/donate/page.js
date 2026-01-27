'use client'

import Image from '@/components/Image'
import LayoutWrapper from '@/components/LayoutWrapper'
import siteMetadata from '@/data/siteMetadata'

export default function DonatePage() {
  return (
    <LayoutWrapper>
      <div className="divide-y divide-gray-200 dark:divide-gray-700">
        <div className="pt-6 pb-8 space-y-2 md:space-y-5">
          <h1 className="text-3xl font-extrabold leading-9 tracking-tight text-gray-900 dark:text-gray-100 sm:text-4xl sm:leading-10 md:text-6xl md:leading-14">
            Donaciones
          </h1>
        </div>
        <div className="items-start space-y-2 py-4 xl:grid xl:grid-cols-1 xl:gap-x-8 xl:space-y-0">
          <h2 className="text-sm tracking-tight leading-5 text-gray-800 dark:text-gray-200 sm:text-lg sm:leading-6 md:text-xl md:leading-8">
            Sea parte del esfuerzo de la Sociedad de Astronomia del Caribe
          </h2>
          <div className="pt-4 pb-2 prose dark:prose-dark max-w-none">
            La Sociedad de Astronomia del Caribe es una organizacion sin fines de lucro 501(c)(3)
            que ofrece varias actividades educativas y de observacion astronomica durante el ano en
            diversas partes de la isla, libre de costo. Con tu donativo ayudas a la SAC a cumplir su
            mision de difundir la ciencia de la astronomia en Puerto Rico, el Caribe y el mundo.
          </div>
          {/* ATH Movil */}
          <div className="block md:hidden">
            <button
              className="inline px-4 py-2 text-sm font-medium leading-5 text-white transition-colors duration-150 bg-blue-600 border border-transparent rounded-lg shadow focus:outline-none focus:shadow-outline-blue hover:bg-blue-700 dark:hover:bg-blue-500"
              onClick={() => window.open(siteMetadata.payments.payAthMovil, '_blank')}
            >
              Donativo con AthMovil
            </button>
          </div>
          {/* ATH Movil QR*/}
          <div className="hidden md:block">
            <div className="pt-2 pb-4 prose dark:prose-dark max-w-none">
              Tambien puedes hacer tu donativo con ATH Movil desde tu celular.
            </div>
            <Image
              src={siteMetadata.payments.payAthMovilQR}
              alt="SAC ATH Movil"
              width={400}
              height={452}
            />
          </div>
          {/* PayPal button*/}
          <div className="pt-2 pb-2 prose dark:prose-dark max-w-none">
            <button
              className="inline px-4 py-2 text-sm font-medium leading-5 text-white transition-colors duration-150 bg-blue-600 border border-transparent rounded-lg shadow focus:outline-none focus:shadow-outline-blue hover:bg-blue-700 dark:hover:bg-blue-500"
              onClick={() => window.open(siteMetadata.payments.donatePaypal, '_blank')}
            >
              Donativo con PayPal
            </button>
          </div>
        </div>
      </div>
    </LayoutWrapper>
  )
}
