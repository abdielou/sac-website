import { PageSEO } from '@/components/SEO'
import SocialIcon from '@/components/social-icons'
import siteMetadata from '@/data/siteMetadata'

export default function Contact() {
  return (
    <>
      <PageSEO title="Actividades" description="Noches de Observación Astronómica" />
      <div className="divide-y divide-gray-200 dark:divide-gray-700">
        <div className="pt-6 pb-8 space-y-2 md:space-y-5">
          <h1 className="text-3xl font-extrabold leading-9 tracking-tight text-gray-900 dark:text-gray-100 sm:text-4xl sm:leading-10 md:text-6xl md:leading-14">
            Noches de Observación Astronómica
          </h1>
        </div>
        <div className="items-start space-y-2 py-4 xl:grid xl:grid-cols-1 xl:gap-x-8 xl:space-y-0">
          <h2 className="text-sm tracking-tight leading-5 text-gray-800 dark:text-gray-200 sm:text-lg sm:leading-6 md:text-xl md:leading-8">
            Noches de Observación bajo cielos oscuros
          </h2>
          <div className="pt-4 prose dark:prose-dark max-w-none">
            Deseas asistir u organizar una noche de observación con la Sociedad de Astronomía del
            Caribe? En nuestras actividades podrás ver objetos celestes que simplemente no se pueden
            ver desde lugares con exceso de iluminación, incluyendo galaxias, cúmulos estelares,
            nebulosas y más. Invita a tus familiares y amistades.
          </div>
          <div className="pt-2 pb-2 prose dark:prose-dark max-w-none">
            Para mantenerte al tanto de nuestras actividades nos puedes seguir en nuestra página de
            Facebook
            <span className="inline-block ml-2">
              <SocialIcon kind="facebook" href={siteMetadata.facebook} size="6" />
            </span>
            . Si deseas solicitar una actividad para tu grupo o entidad, puedes hacerlo con el
            siguiente enlace.
          </div>
          <button
            className="inline px-4 py-2 text-sm font-medium leading-5 text-white transition-colors duration-150 bg-blue-600 border border-transparent rounded-lg shadow focus:outline-none focus:shadow-outline-blue hover:bg-blue-700 dark:hover:bg-blue-500"
            onClick={() => window.open(siteMetadata.forms.event, '_blank')}
          >
            Solicitud de Actividad
          </button>
        </div>
      </div>
    </>
  )
}
