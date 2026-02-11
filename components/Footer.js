import Link from './Link'
import siteMetadata from '@/data/siteMetadata'
import SocialIcon from '@/components/social-icons'

export default function Footer() {
  return (
    <footer>
      <div className="mt-16 grid grid-cols-12">
        <div className="col-span-12 flex justify-center mb-3 space-x-4">
          <SocialIcon kind="mail" href={`mailto:${siteMetadata.email}`} size="6" />
          <SocialIcon kind="facebook" href={siteMetadata.facebook} size="6" />
          <SocialIcon kind="youtube" href={siteMetadata.youtube} size="6" />
          <SocialIcon kind="instagram" href={siteMetadata.instagram} size="6" />
          <SocialIcon kind="linkedin" href={siteMetadata.linkedin} size="6" />
          <SocialIcon kind="twitter" href={siteMetadata.twitter} size="6" />
          <Link href="/admin" className="text-sm text-gray-500 transition hover:text-gray-600">
            <span className="sr-only">Admin</span>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              className="fill-current text-gray-700 dark:text-gray-200 hover:text-blue-500 dark:hover:text-blue-400 h-6 w-6"
            >
              <path
                fillRule="evenodd"
                d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z"
                clipRule="evenodd"
              />
            </svg>
          </Link>
        </div>
        <div className="col-span-12 mb-2 text-sm text-gray-500 dark:text-gray-400">
          <div className="flex flex-col items-center justify-center gap-y-1 sm:flex-row sm:gap-x-2">
            <div className="flex items-center gap-x-2">
              <div>{siteMetadata.author}</div>
              <div>{` • `}</div>
              <div className="whitespace-nowrap">{`© ${new Date().getFullYear()}`}</div>
            </div>
            <div className="hidden sm:block">{` • `}</div>
            <Link href="/" className="block text-center sm:inline sm:text-left">
              {siteMetadata.title}
            </Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
