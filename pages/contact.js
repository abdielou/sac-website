import { PageSEO } from '@/components/SEO'

const EmailIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    className="h-6 w-6"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207"
    />
  </svg>
)
const PhoneIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    className="h-6 w-6"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
    />
  </svg>
)
const EMAIL = 'info@sociedadastronomia.com'
export default function Contact() {
  return (
    <>
      <PageSEO title="Contacto" description="Información de Contacto" />
      <div className="divide-y divide-gray-200 dark:divide-gray-700">
        <div className="pt-6 pb-8 space-y-2 md:space-y-5">
          <h1 className="text-3xl font-extrabold leading-9 tracking-tight text-gray-900 dark:text-gray-100 sm:text-4xl sm:leading-10 md:text-6xl md:leading-14">
            Contacto
          </h1>
        </div>
        <div className="container py-12">
          <div className="flex flex-wrap -m-4">
            <div className="w-full p-4">
              <div className="flex">
                <EmailIcon />
                <h3 className="flex flex-row ml-1">
                  <div className="mr-2">Email:</div>
                  <div className="flex flex-wrap space-x-6">
                    <a
                      className="underline text-blue-600 hover:text-blue-800 visited:text-purple-600"
                      href={`mailto:${EMAIL}`}
                    >
                      {EMAIL}
                    </a>
                  </div>
                </h3>
              </div>
            </div>
            <div className="w-full p-4">
              <div className="flex">
                <PhoneIcon />
                <h3 className="flex flex-row ml-1">
                  <div className="mr-2">Teléfonos:</div>
                  <div className="flex flex-wrap space-x-6">
                    <a
                      className="underline text-blue-600 hover:text-blue-800 visited:text-purple-600"
                      href="tel:17874147771"
                    >
                      1 (787) 414-7771
                    </a>
                    <a
                      className="underline text-blue-600 hover:text-blue-800 visited:text-purple-600"
                      href="tel:17872472244"
                    >
                      1 (787) 247-2244
                    </a>
                  </div>
                </h3>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
