import Head from 'next/head'
import Image from 'next/image'
import { ThemeProvider, useTheme } from 'next-themes'
import { useEffect, useMemo } from 'react'

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
    username: 'ATH Móvil y PayPal',
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
    label: 'Únete a nuestro equipo',
    username: 'Membresía',
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
    label: 'Síguenos en Facebook',
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
    label: 'Síguenos en Instagram',
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
    label: 'Síguenos en X',
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
    label: 'Suscríbete a nuestro canal',
    username: '@sociedadastronomia',
    url: 'https://www.youtube.com/@sociedadastronomia',
  },
  {
    platform: 'Web',
    image: {
      src: '/static/images/sac-Asset 28.png',
      width: 512,
      height: 512,
      sizeAdjust: 1,
    },
    label: 'Visita nuestra página web',
    username: 'sociedadastronomia.com',
    url: '/',
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
    username: 'Guía',
    url: '/blog/telescopios',
  },
  {
    platform: 'Email',
    image: {
      src: '/static/images/email.png',
      width: 512,
      height: 512,
      sizeAdjust: 1,
    },
    label: 'Escríbenos',
    username: 'info@sociedadastronomia.com',
    url: 'mailto:info@sociedadastronomia.com',
  },
]

export default function Links() {
  const { theme, setTheme } = useTheme()

  useEffect(() => {
    setTheme('light')
  }, [setTheme])

  const maxWidth = useMemo(
    () =>
      Math.max(
        ...socialLinks.map(
          (link) => (link.image.width / link.image.height) * 48 * link.image.sizeAdjust
        )
      ),
    []
  )

  return (
    <ThemeProvider attribute="class">
      <div className="min-h-screen">
        <Head>
          <title>Enlaces - Sociedad Astronómica del Caribe</title>
          <meta name="description" content="Enlaces a nuestras redes sociales" />
        </Head>

        <main className="max-w-xl mx-auto px-4 py-4">
          <div className="space-y-4">
            {socialLinks.map((link) => {
              return (
                <a
                  key={link.platform}
                  href={link.url}
                  target="_self"
                  rel="noopener noreferrer"
                  className={`${
                    theme === 'dark'
                      ? 'block w-full p-4 bg-white hover:bg-white rounded-md transition-colors duration-200'
                      : 'block w-full p-4 bg-gray-100 hover:bg-gray-100 rounded-md transition-colors duration-200'
                  }`}
                  style={{
                    filter:
                      theme === 'dark'
                        ? 'drop-shadow(1px 1px 2px rgb(255 255 255 / 0.15))'
                        : 'drop-shadow(1px 1px 2px rgb(125 125 125))',
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
                        width={
                          (link.image.width / link.image.height) * (48 * link.image.sizeAdjust)
                        }
                        height={48 * link.image.sizeAdjust}
                        className="object-contain"
                      />
                    </div>
                    <div className="flex-grow space-y-1">
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
        </main>
      </div>
    </ThemeProvider>
  )
}
