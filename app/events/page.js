import LayoutWrapper from '@/components/LayoutWrapper'
import SocialIcon from '@/components/social-icons'
import siteMetadata from '@/data/siteMetadata'

export const metadata = {
  title: 'Actividades',
  description: 'Noches de Observacion Astronomica',
  openGraph: {
    title: 'Actividades | SAC',
    description: 'Noches de Observacion Astronomica',
  },
}

export default function EventsPage() {
  return (
    <LayoutWrapper>
      <div className="divide-y divide-gray-200 dark:divide-gray-700">
        <div className="pt-6 pb-8 space-y-2 md:space-y-5">
          <h1 className="text-3xl font-extrabold leading-9 tracking-tight text-gray-900 dark:text-gray-100 sm:text-4xl sm:leading-10 md:text-6xl md:leading-14">
            Noches de Observacion Astronomica
          </h1>
        </div>
        <div className="items-start space-y-2 py-4 xl:grid xl:grid-cols-1 xl:gap-x-8 xl:space-y-0">
          <h2 className="text-sm tracking-tight leading-5 text-gray-800 dark:text-gray-200 sm:text-lg sm:leading-6 md:text-xl md:leading-8">
            Noches de Observacion bajo cielos oscuros
          </h2>
          <div className="pt-4 prose dark:prose-dark max-w-none">
            Deseas asistir u organizar una noche de observacion con la Sociedad de Astronomia del
            Caribe? En nuestras actividades podras ver objetos celestes que simplemente no se pueden
            ver desde lugares con exceso de iluminacion, incluyendo galaxias, cumulos estelares,
            nebulosas y mas. Invita a tus familiares y amistades.
          </div>
          <div className="pt-2 pb-2 prose dark:prose-dark max-w-none">
            Para mantenerte al tanto de nuestras actividades nos puedes seguir en nuestra pagina de
            Facebook
            <span className="inline-block ml-2">
              <SocialIcon kind="facebook" href={siteMetadata.facebook} size="6" />
            </span>
            . Si deseas solicitar una actividad para tu grupo o entidad, puedes hacerlo con el
            siguiente enlace.
          </div>
          <h2 className="text-sm tracking-tight leading-5 text-gray-800 dark:text-gray-200 sm:text-lg sm:leading-6 md:text-xl md:leading-8">
            <span className="font-bold">Atencion:</span> Esta seccion ha sido deshabilitada por el
            momento ya que nuestra agenda de actividades se encuentra llena. Agradecemos por su
            comprension!
          </h2>
          <button
            className="inline px-4 py-2 text-sm font-medium leading-5 text-white bg-blue-600 border border-transparent rounded-lg shadow focus:outline-none focus:shadow-outline-blue cursor-not-allowed opacity-25 line-through"
            disabled
          >
            Solicitud de Actividad
          </button>
        </div>
      </div>
    </LayoutWrapper>
  )
}
