import Link from '@/components/Link'
import PageTitle from '@/components/PageTitle'
import Image from 'next/image'
import siteMetadata from '@/data/siteMetadata'
import LayoutWrapper from '@/components/LayoutWrapper'

export const metadata = {
  title: `Guias de Marca`,
  description: `Guias completas de marca de la ${siteMetadata.headerTitle}. Descarga logos, colores y recursos para mantener la consistencia de la identidad visual.`,
  openGraph: {
    title: `Guias de Marca | ${siteMetadata.headerTitle}`,
    description: `Guias completas de marca de la ${siteMetadata.headerTitle}. Descarga logos, colores y recursos para mantener la consistencia de la identidad visual.`,
  },
}

const logoVariants = [
  {
    name: 'Logo Principal',
    description: `Logo completo de la ${siteMetadata.headerTitle}`,
    preview: '/static/brand/Logo/SVG/sac-main-logo.svg',
    background: 'light',
    formats: {
      png: { path: '/static/brand/Logo/PNG/sac-main-logo.png', filename: 'sac-main-logo.png' },
      jpg: { path: '/static/brand/Logo/JPG/sac-main-logo.jpg', filename: 'sac-main-logo.jpg' },
      svg: { path: '/static/brand/Logo/SVG/sac-main-logo.svg', filename: 'sac-main-logo.svg' },
    },
  },
  {
    name: 'Logo Simple',
    description: 'Version simple del logo principal',
    preview: '/static/brand/Logo/SVG/sac-main-short-logo.svg',
    background: 'light',
    formats: {
      png: {
        path: '/static/brand/Logo/PNG/sac-main-short-logo.png',
        filename: 'sac-main-short-logo.png',
      },
      jpg: {
        path: '/static/brand/Logo/JPG/sac-main-short-logo.jpg',
        filename: 'sac-main-short-logo.jpg',
      },
      svg: {
        path: '/static/brand/Logo/SVG/sac-main-short-logo.svg',
        filename: 'sac-main-short-logo.svg',
      },
    },
  },
  {
    name: 'Logo Blanco',
    description: 'Logo en color blanco para fondos oscuros',
    preview: '/static/brand/Logo/SVG/sac-white-main-logo.svg',
    background: 'dark',
    formats: {
      svg: {
        path: '/static/brand/Logo/SVG/sac-white-main-logo.svg',
        filename: 'sac-white-main-logo.svg',
      },
    },
  },
  {
    name: 'Logo Blanco Simple',
    description: 'Version simple del logo blanco',
    preview: '/static/brand/Logo/SVG/sac-white-main-short-logo.svg',
    background: 'dark',
    formats: {
      svg: {
        path: '/static/brand/Logo/SVG/sac-white-main-short-logo.svg',
        filename: 'sac-white-main-short-logo.svg',
      },
    },
  },
  {
    name: 'Logo Blanco y Negro',
    description: 'Logo en blanco y negro',
    preview: '/static/brand/Logo/SVG/sac-bw-logo.svg',
    background: 'light',
    formats: {
      png: { path: '/static/brand/Logo/PNG/sac-bw-logo.png', filename: 'sac-bw-logo.png' },
      jpg: { path: '/static/brand/Logo/JPG/sac-bw-logo.jpg', filename: 'sac-bw-logo.jpg' },
      svg: { path: '/static/brand/Logo/SVG/sac-bw-logo.svg', filename: 'sac-bw-logo.svg' },
    },
  },
  {
    name: 'Logo Blanco y Negro Simple',
    description: 'Version simple del logo blanco y negro',
    preview: '/static/brand/Logo/SVG/sac-bw-short-logo.svg',
    background: 'light',
    formats: {
      png: {
        path: '/static/brand/Logo/PNG/sac-bw-short-logo.png',
        filename: 'sac-bw-short-logo.png',
      },
      jpg: {
        path: '/static/brand/Logo/JPG/sac-bw-short-logo.jpg',
        filename: 'sac-bw-short-logo.jpg',
      },
      svg: {
        path: '/static/brand/Logo/SVG/sac-bw-short-logo.svg',
        filename: 'sac-bw-short-logo.svg',
      },
    },
  },
]

const anniversaryLogos = [
  {
    name: 'Logo 25 Aniversario',
    description: 'Logo especial para el 25 aniversario',
    preview: '/static/brand/Logo 25 Aniversario/SVG/sac-logo-25-aniversario.svg',
    background: 'light',
    formats: {
      png: {
        path: '/static/brand/Logo 25 Aniversario/PNG/sac-logo-25-aniversario.png',
        filename: 'sac-logo-25-aniversario.png',
      },
      jpg: {
        path: '/static/brand/Logo 25 Aniversario/JPG/sac-logo-25-aniversario.jpg',
        filename: 'sac-logo-25-aniversario.jpg',
      },
      svg: {
        path: '/static/brand/Logo 25 Aniversario/SVG/sac-logo-25-aniversario.svg',
        filename: 'sac-logo-25-aniversario.svg',
      },
    },
  },
  {
    name: 'Logo 25 Aniversario Blanco',
    description: 'Logo especial del 25 aniversario en blanco',
    preview: '/static/brand/Logo 25 Aniversario/SVG/sac-logo-25-aniversario-white.svg',
    background: 'dark',
    formats: {
      png: {
        path: '/static/brand/Logo 25 Aniversario/PNG/sac-logo-25-aniversario-white.png',
        filename: 'sac-logo-25-aniversario-white.png',
      },
      jpg: {
        path: '/static/brand/Logo 25 Aniversario/JPG/sac-logo-25-aniversario-white.jpg',
        filename: 'sac-logo-25-aniversario-white.jpg',
      },
      svg: {
        path: '/static/brand/Logo 25 Aniversario/SVG/sac-logo-25-aniversario-white.svg',
        filename: 'sac-logo-25-aniversario-white.svg',
      },
    },
  },
  {
    name: 'Logo 25 Aniversario Simple',
    description: 'Version simple del logo del 25 aniversario',
    preview: '/static/brand/Logo 25 Aniversario/SVG/sac-logo-25-aniversario-short.svg',
    background: 'light',
    formats: {
      png: {
        path: '/static/brand/Logo 25 Aniversario/PNG/sac-logo-25-aniversario-short.png',
        filename: 'sac-logo-25-aniversario-short.png',
      },
      jpg: {
        path: '/static/brand/Logo 25 Aniversario/JPG/sac-logo-25-aniversario-short.jpg',
        filename: 'sac-logo-25-aniversario-short.jpg',
      },
      svg: {
        path: '/static/brand/Logo 25 Aniversario/SVG/sac-logo-25-aniversario-short.svg',
        filename: 'sac-logo-25-aniversario-short.svg',
      },
    },
  },
  {
    name: 'Logo 25 Aniversario Simple Blanco',
    description: 'Version simple del logo del 25 aniversario en blanco',
    preview: '/static/brand/Logo 25 Aniversario/SVG/sac-logo-25-aniversario-short-white.svg',
    background: 'dark',
    formats: {
      png: {
        path: '/static/brand/Logo 25 Aniversario/PNG/sac-logo-25-aniversario-short-white.png',
        filename: 'sac-logo-25-aniversario-short-white.png',
      },
      jpg: {
        path: '/static/brand/Logo 25 Aniversario/JPG/sac-logo-25-aniversario-short-white.jpg',
        filename: 'sac-logo-25-aniversario-short-white.jpg',
      },
      svg: {
        path: '/static/brand/Logo 25 Aniversario/SVG/sac-logo-25-aniversario-short-white.svg',
        filename: 'sac-logo-25-aniversario-short-white.svg',
      },
    },
  },
]

export default function BrandPage() {
  return (
    <LayoutWrapper>
      <div className="divide-y divide-gray-200 dark:divide-gray-700">
        <div className="space-y-2 pb-8 pt-6 md:space-y-5">
          <PageTitle>Guias de Marca</PageTitle>
          <p className="text-lg leading-7 text-gray-500 dark:text-gray-400">
            Recursos completos para la identidad visual de la {siteMetadata.headerTitle}
          </p>
        </div>

        <div className="divide-y divide-gray-200 dark:divide-gray-700">
          {/* Logo Usage Guidelines */}
          <div className="py-8">
            <h2 className="text-2xl font-bold leading-8 tracking-tight mb-4">Uso del Logo</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Sigue estas reglas importantes para mantener la integridad y consistencia de la marca
              SAC:
            </p>
            <div className="prose prose-lg dark:prose-dark max-w-none">
              <ul className="space-y-1">
                <li>Manten siempre la proporcion original del logo</li>
                <li>No modifiques los colores, fuentes o elementos del logo</li>
                <li>
                  Manten un espacio minimo alrededor del logo equivalente al tamano de la "S"
                  mayuscula
                </li>
                <li>No coloques el logo sobre fondos que reduzcan su legibilidad</li>
                <li>Usa el logo blanco unicamente sobre fondos oscuros</li>
                <li>Para usos comerciales, contacta con la junta directiva para aprobacion</li>
              </ul>
            </div>
          </div>

          {/* Main Logos */}
          <div className="py-8">
            <h2 className="text-2xl font-bold leading-8 tracking-tight mb-6">Logos Principales</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {logoVariants.map((logo, index) => (
                <div
                  key={index}
                  className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex justify-center mb-4">
                      <div
                        className={`w-32 h-16 flex items-center justify-center ${
                          logo.background === 'dark' ? 'bg-gray-900' : 'bg-white'
                        } rounded`}
                      >
                        <Image
                          src={logo.preview}
                          alt={logo.name}
                          width={120}
                          height={60}
                          className="object-contain max-w-full max-h-full"
                        />
                      </div>
                    </div>
                    <h3 className="text-lg font-semibold mb-2 text-center">{logo.name}</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 text-center">
                      {logo.description}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3 text-sm justify-center">
                    {Object.entries(logo.formats).map(([format, { path, filename }]) => (
                      <a
                        key={format}
                        href={path}
                        download={filename}
                        className="text-primary-600 hover:text-primary-500 dark:text-primary-400 dark:hover:text-primary-300 font-medium underline decoration-1 underline-offset-2 transition-colors"
                      >
                        {format.toUpperCase()}
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 25th Anniversary Logos */}
          <div className="py-8">
            <h2 className="text-2xl font-bold leading-8 tracking-tight mb-6">
              Logos del 25 Aniversario
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {anniversaryLogos.map((logo, index) => (
                <div
                  key={index}
                  className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex justify-center mb-4">
                      <div
                        className={`w-40 h-20 flex items-center justify-center ${
                          logo.background === 'dark' ? 'bg-gray-900' : 'bg-white'
                        } rounded`}
                      >
                        <Image
                          src={logo.preview}
                          alt={logo.name}
                          width={150}
                          height={75}
                          className="object-contain max-w-full max-h-full"
                        />
                      </div>
                    </div>
                    <h3 className="text-lg font-semibold mb-2 text-center">{logo.name}</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 text-center">
                      {logo.description}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3 text-sm justify-center">
                    {Object.entries(logo.formats).map(([format, { path, filename }]) => (
                      <a
                        key={format}
                        href={path}
                        download={filename}
                        className="text-primary-600 hover:text-primary-500 dark:text-primary-400 dark:hover:text-primary-300 font-medium underline decoration-1 underline-offset-2 transition-colors"
                      >
                        {format.toUpperCase()}
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Color Palette */}
          <div className="py-8">
            <h2 className="text-2xl font-bold leading-8 tracking-tight mb-6">Paleta de Colores</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
                <div className="flex items-center space-x-4 mb-4">
                  <div
                    className="w-16 h-16 rounded-lg border-2 border-gray-300 dark:border-gray-600 shrink-0"
                    style={{ backgroundColor: '#560647' }}
                  ></div>
                  <div>
                    <h3 className="text-lg font-semibold">Tyrian Purple</h3>
                    <p className="text-gray-600 dark:text-gray-400 font-mono">#560647</p>
                  </div>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  <strong>Color primario principal</strong> de la marca SAC. Utilizado en logos y
                  elementos principales.
                </p>
              </div>

              <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
                <div className="flex items-center space-x-4 mb-4">
                  <div
                    className="w-16 h-16 rounded-lg border-2 border-gray-300 dark:border-gray-600 shrink-0"
                    style={{ backgroundColor: '#1B1751' }}
                  ></div>
                  <div>
                    <h3 className="text-lg font-semibold">Russian Violet</h3>
                    <p className="text-gray-600 dark:text-gray-400 font-mono">#1B1751</p>
                  </div>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  <strong>Color primario secundario</strong> para elementos de soporte y fondos.
                </p>
              </div>

              <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
                <div className="flex items-center space-x-4 mb-4">
                  <div
                    className="w-16 h-16 rounded-lg border-2 border-gray-300 dark:border-gray-600 shrink-0"
                    style={{ backgroundColor: '#C8ABDB' }}
                  ></div>
                  <div>
                    <h3 className="text-lg font-semibold">Wisteria</h3>
                    <p className="text-gray-600 dark:text-gray-400 font-mono">#C8ABDB</p>
                  </div>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  <strong>Color secundario</strong> para acentos y elementos decorativos.
                </p>
              </div>

              <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
                <div className="flex items-center space-x-4 mb-4">
                  <div
                    className="w-16 h-16 rounded-lg border-2 border-gray-300 dark:border-gray-600 shrink-0"
                    style={{ backgroundColor: '#EDB898' }}
                  ></div>
                  <div>
                    <h3 className="text-lg font-semibold">Tumbleweed</h3>
                    <p className="text-gray-600 dark:text-gray-400 font-mono">#EDB898</p>
                  </div>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  <strong>Color terciario</strong> neutro para fondos claros y elementos
                  secundarios.
                </p>
              </div>
            </div>
          </div>

          {/* Implementation Examples */}
          <div className="py-8">
            <h2 className="text-2xl font-bold leading-8 tracking-tight mb-6">
              Ejemplos de Implementacion
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Ejemplos visuales de como aplicar la marca SAC en disenos claros y oscuros para
              diferentes materiales y contextos.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-1 gap-6">
              <div className="bg-white dark:bg-gray-800 px-6 py-4 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 flex justify-center">
                <Image
                  src="/static/brand/Implementation/imp-dark.png"
                  alt="Ejemplo de implementacion con diseno oscuro"
                  width={1920}
                  height={608}
                  className="h-auto object-contain max-w-full"
                />
              </div>

              <div className="bg-white dark:bg-gray-800 px-6 py-4 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 flex justify-center">
                <Image
                  src="/static/brand/Implementation/imp-light.png"
                  alt="Ejemplo de implementacion con diseno claro"
                  width={1882}
                  height={608}
                  className="h-auto object-contain max-w-full"
                />
              </div>
            </div>
          </div>

          {/* Contact Information */}
          <div className="py-8">
            <h2 className="text-2xl font-bold leading-8 tracking-tight mb-4">
              Contacto para Usos Especiales
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Para usos comerciales, modificaciones del logo, o cualquier duda sobre la aplicacion
              de la marca, por favor contacta con la junta directiva.
            </p>
            <Link
              href="/contact"
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
            >
              Contactar Junta Directiva
            </Link>
          </div>
        </div>
      </div>
    </LayoutWrapper>
  )
}
