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
        <header className="py-10">
          <div className="hidden xl:flex items-center justify-between">
            <NameLogo />
            <div className="flex items-center text-base leading-5">
              <div>
                <NavigationLinks />
              </div>
              <ThemeSwitch />
            </div>
          </div>
          <div className="flex xl:hidden flex-col">
            <div className="flex items-center justify-between">
              <NameLogo />
              <ThemeSwitch />
              <MobileNav />
            </div>
            <div className="hidden md:flex justify-between">
              <NavigationLinks />
            </div>
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
            <Image src={siteMetadata.siteLogo} alt="SAC Logo" width={150} height={75} />
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
    <>
      {headerNavLinks.map((link) => (
        <Link
          key={link.title}
          href={link.href}
          className="p-1 font-medium text-gray-900 xl:p-4 md:py-3 dark:text-gray-100"
        >
          {link.title}
        </Link>
      ))}
    </>
  )
}
