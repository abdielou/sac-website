import siteMetadata from '@/data/siteMetadata'
import headerNavLinks from '@/data/headerNavLinks'
import Image from 'next/image'
import Link from './Link'
import SectionContainer from './SectionContainer'
import Footer from './Footer'
import MobileNav from './MobileNav'
import ThemeSwitch from './ThemeSwitch'

const LayoutWrapper = ({ children }) => {
  return (
    <SectionContainer>
      <div className="flex flex-col justify-between h-screen">
        <header className="flex items-center justify-between py-10">
          <NameLogo />
          <div className="flex items-center text-base leading-5">
            <NavigationLinks />
            <ThemeSwitch />
            <MobileNav />
          </div>
        </header>
        <main className="mb-auto">{children}</main>
        <Footer />
      </div>
    </SectionContainer>
  )
}

export default LayoutWrapper

const NameLogo = () => {
  return (
    <div>
      <Link href="/" aria-label={siteMetadata.title}>
        <div className="flex items-center justify-between">
          <div className="mr-3">
            <Image src={siteMetadata.siteLogo} alt="SAC Logo" width={150} height={116} />
          </div>
          {typeof siteMetadata.headerTitle === 'string' ? (
            <div className="hidden h-6 text-2xl font-semibold sm:block">
              {siteMetadata.headerTitle}
            </div>
          ) : (
            siteMetadata.headerTitle
          )}
        </div>
      </Link>
    </div>
  )
}
const NavigationLinks = () => {
  return (
    <div className="hidden sm:block">
      {headerNavLinks.map((link) => (
        <Link
          key={link.title}
          href={link.href}
          className="p-1 font-medium text-gray-900 sm:p-4 dark:text-gray-100"
        >
          {link.title}
        </Link>
      ))}
    </div>
  )
}
