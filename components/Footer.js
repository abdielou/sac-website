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
          <SocialIcon kind="linkedin" href={siteMetadata.linkedin} size="6" />
          <SocialIcon kind="twitter" href={siteMetadata.twitter} size="6" />
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
