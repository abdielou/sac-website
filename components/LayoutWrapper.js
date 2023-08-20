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
  const { theme, resolvedTheme } = useTheme('dark')
  return (
    <SectionContainer>
      <div className="flex flex-col justify-between h-screen">
        <header className="py-10">
          <div className="flex flex-col">
            <div className="flex items-center justify-between">
              <div>
                <Link href="/" aria-label={siteMetadata.title}>
                  <div className="flex items-center justify-between">
                    <div className="mr-3 hidden sm:block">
                      <Image
                        src={
                          theme === 'dark' || resolvedTheme === 'dark'
                            ? siteMetadata.siteLogoShortDark
                            : siteMetadata.siteLogoShortLight
                        }
                        alt="SAC Logo"
                        width={200}
                        height={47}
                      />
                    </div>
                    <div className="mr-3 block sm:hidden">
                      <Image
                        src={
                          theme === 'dark' || resolvedTheme === 'dark'
                            ? siteMetadata.siteLogoDark
                            : siteMetadata.siteLogoLight
                        }
                        alt="SAC Logo"
                        width={200}
                        height={70}
                      />
                    </div>
                    <div
                      className={
                        (theme === 'light' || resolvedTheme === 'light'
                          ? 'text-sac-primary-blue'
                          : '') +
                        ' hidden sm:block xl:pl-10 md:pl-4 h-10 xl:text-3xl lg:text-2xl md:text-2xl font-semibold italic tracking-tight xl:tracking-normal'
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
