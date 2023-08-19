import siteMetadata from '@/data/siteMetadata'
import headerNavLinks from '@/data/headerNavLinks'
import Image from 'next/image'
import Link from './Link'
import SectionContainer from './SectionContainer'
import Footer from './Footer'
import MobileNav from './MobileNav'
import ThemeSwitch from './ThemeSwitch'
import { useTheme } from 'next-themes'

const LayoutWrapper = ({ children }) => {
  const { theme } = useTheme()
  return (
    <SectionContainer>
      <div className="flex flex-col justify-between h-screen">
        <header className="py-10">
          <div className="flex flex-col">
            <div className="flex items-center justify-between">
              <div>
                <Link href="/" aria-label={siteMetadata.title}>
                  <div className="flex items-center justify-between">
                    <div className="mr-3">
                      <Image
                        src={
                          theme == 'dark' ? siteMetadata.siteLogoDark : siteMetadata.siteLogoLight
                        }
                        alt="SAC Logo"
                        width={200}
                        height={75}
                      />
                    </div>
                    <div
                      className={
                        (theme == 'light' ? 'text-sac-primary-blue' : '') +
                        ' hidden h-10 text-3xl font-semibold italic sm:block tracking-tight xl:tracking-normal'
                      }
                    >
                      {siteMetadata.headerTitle}
                    </div>
                  </div>
                </Link>
              </div>
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
