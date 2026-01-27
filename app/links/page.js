import Image from 'next/image'
import LayoutWrapper from '@/components/LayoutWrapper'

export const metadata = {
  title: 'Enlaces - Sociedad Astronomica del Caribe',
  description: 'Enlaces a nuestras redes sociales',
}

const socialLinks = [
  {
    platform: 'Donate',
    image: {
      src: '/static/images/donate.jpeg',
      width: 512,
      height: 512,
      sizeAdjust: 1.3,
    },
    label: 'Donativos',
    username: 'ATH Movil y PayPal',
    url: '/donate',
  },
  {
    platform: 'Membership',
    image: {
      src: '/static/images/membership.jpeg',
      width: 512,
      height: 512,
      sizeAdjust: 1,
    },
    label: 'Unete a nuestro equipo',
    username: 'Membresia',
    url: '/membership',
  },
  {
    platform: 'Facebook',
    image: {
      src: '/static/images/facebook.svg',
      width: 800,
      height: 800,
      sizeAdjust: 1,
    },
    label: 'Siguenos en Facebook',
    username: '@sociedad.astronomia',
    url: 'https://www.facebook.com/sociedad.astronomia',
  },
  {
    platform: 'Instagram',
    image: {
      src: '/static/images/instagram.svg',
      width: 132,
      height: 132,
      sizeAdjust: 1,
    },
    label: 'Siguenos en Instagram',
    username: '@socastronomiacaribe',
    url: 'https://www.instagram.com/socastronomiacaribe/',
  },
  {
    platform: 'X',
    image: {
      src: '/static/images/x.svg',
      width: 300,
      height: 300,
      sizeAdjust: 1,
    },
    label: 'Siguenos en X',
    username: '@Soc_AstroCaribe',
    url: 'https://x.com/Soc_AstroCaribe',
  },
  {
    platform: 'YouTube',
    image: {
      src: '/static/images/youtube.svg',
      width: 512,
      height: 512,
      sizeAdjust: 1,
    },
    label: 'Suscribete a nuestro canal',
    username: '@sociedadastronomia',
    url: 'https://www.youtube.com/@sociedadastronomia',
  },
  {
    platform: 'Telescope Guide',
    image: {
      src: '/static/images/sac-Asset 20.png',
      width: 512,
      height: 512,
      sizeAdjust: 1,
    },
    label: 'Telescopios Recomendados',
    username: 'Guia',
    url: '/blog/telescopios',
  },
  {
    platform: 'Weather',
    image: {
      src: '/static/images/weather.svg',
      width: 512,
      height: 512,
      sizeAdjust: 1,
    },
    label: 'Clima',
    username: 'Reporte detallado del tiempo.',
    url: '/weather',
  },
  {
    platform: 'Web',
    image: {
      src: '/static/images/sac-Asset 28.png',
      width: 512,
      height: 512,
      sizeAdjust: 1,
    },
    label: 'Visita nuestra pagina web',
    username: 'sociedadastronomia.com',
    url: '/',
  },
  {
    platform: 'Email',
    image: {
      src: '/static/images/email.png',
      width: 512,
      height: 512,
      sizeAdjust: 1,
    },
    label: 'Escribenos',
    username: 'info@sociedadastronomia.com',
    url: 'mailto:info@sociedadastronomia.com',
  },
]

// Compute maxWidth at build time (static data)
const maxWidth = Math.max(
  ...socialLinks.map((link) => (link.image.width / link.image.height) * 48 * link.image.sizeAdjust)
)

export default function LinksPage() {
  return (
    <LayoutWrapper forceLightHeader={true}>
      <div className="max-w-xl mx-auto px-4 py-4">
        <div className="space-y-4">
          {socialLinks.map((link) => {
            return (
              <a
                key={link.platform}
                href={link.url}
                target="_self"
                rel="noopener noreferrer"
                className="block w-full p-4 bg-gray-100 hover:bg-gray-100 rounded-md transition-colors duration-200"
                style={{
                  filter: 'drop-shadow(1px 1px 2px rgb(125 125 125))',
                }}
              >
                <div className="flex items-center space-x-4">
                  <div
                    style={{ width: `${maxWidth}px`, height: '48px' }}
                    className="flex justify-center"
                  >
                    <Image
                      src={link.image.src}
                      alt={link.platform}
                      width={(link.image.width / link.image.height) * (48 * link.image.sizeAdjust)}
                      height={48 * link.image.sizeAdjust}
                      className="object-contain"
                    />
                  </div>
                  <div className="grow space-y-1">
                    <div className="text-sm text-gray-900">{link.label}</div>
                    <div className="text-xs text-sac-primary-blue">{link.username}</div>
                  </div>
                  <svg
                    className="w-6 h-6 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </div>
              </a>
            )
          })}
        </div>
      </div>
    </LayoutWrapper>
  )
}
