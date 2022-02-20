import { PageSEO } from '@/components/SEO'
import siteMetadata from '@/data/siteMetadata'

export default function Contact() {
  return (
    <>
      <PageSEO title="Membresía" description="Sea parte de la Sociedad de Astronomía del Caribe" />
      <div className="divide-y divide-gray-200 dark:divide-gray-700">
        <div className="pt-6 pb-8 space-y-2 md:space-y-5">
          <h1 className="text-3xl font-extrabold leading-9 tracking-tight text-gray-900 dark:text-gray-100 sm:text-4xl sm:leading-10 md:text-6xl md:leading-14">
            Membresía
          </h1>
        </div>
        <div className="items-start space-y-2 py-4 xl:grid xl:grid-cols-1 xl:gap-x-8 xl:space-y-0">
          <h2 className="text-sm tracking-tight leading-5 text-gray-800 dark:text-gray-200 sm:text-lg sm:leading-6 md:text-xl md:leading-8">
            Sea parte de la Sociedad de Astronomía del Caribe
          </h2>
          <div className="pt-4 pb-4 prose dark:prose-dark max-w-none">
            La Sociedad de Astronomía del Caribe es una entidad sin fines de lucro que ofrece varias
            actividades educativas y de observación astronómica durante el año en diversas partes de
            la isla, libre de costo. Existe una cuota de membresía para ayudar a sufragar algunos de
            los costos involucrados, lo cual nos permite organizar más actividades educativas y
            brindarle al público la oportunidad de aprender más sobre la ciencia de la Astronomía.
            Al hacerte miembro de la SAC, estás fomentando la educación sobre las ciencias y apoyas
            a una entidad netamente puertorriqueña. Podrás asistir a talleres y otros eventos.
          </div>
          <button
            className="inline px-4 py-2 text-sm font-medium leading-5 text-white transition-colors duration-150 bg-blue-600 border border-transparent rounded-lg shadow focus:outline-none focus:shadow-outline-blue hover:bg-blue-700 dark:hover:bg-blue-500"
            onClick={() => window.open(siteMetadata.forms.membership, '_blank')}
          >
            Formulario de Membresía
          </button>
        </div>
      </div>
    </>
  )
}
