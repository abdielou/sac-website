'use client'

import siteMetadata from '@/data/siteMetadata'
import headerNavLinks from '@/data/headerNavLinks'
import Image from 'next/image'
import Link from './Link'
import SectionContainer from './SectionContainer'
import Footer from './Footer'
import MobileNav from './MobileNav'
import ThemeSwitch from './ThemeSwitch'

/**
 * Header logo sizes. The boxes are reserved in the prerendered HTML so the
 * header cannot grow on hydration.
 */
const LOGO_WIDTH = 200
const LOGO_FULL_HEIGHT = 70
const LOGO_SHORT_HEIGHT = 47

/**
 * The logo used to sit behind a `mounted` flag (useState + useEffect), so it was
 * absent from every prerendered page and injected on hydration. The header then
 * grew about 32px and pushed the whole article down, which measured CLS 0.1233
 * on every article page. The control page /links, which uses forceLightHeader
 * and therefore skipped the gate, measured CLS 0.
 *
 * Both theme variants are now rendered on the server and switched with CSS
 * (`dark:` utilities, darkMode: 'class'), so there is no hydration gap and no
 * layout shift. Only one variant is ever displayed at a time, so screen readers
 * announce a single logo.
 */
const HeaderLogo = ({ lightSrc, darkSrc, height }) => (
  <>
    <Image
      src={lightSrc}
      alt="SAC Logo"
      width={LOGO_WIDTH}
      height={height}
      className="block dark:hidden"
    />
    <Image
      src={darkSrc}
      alt="SAC Logo"
      width={LOGO_WIDTH}
      height={height}
      className="hidden dark:block"
      priority
    />
  </>
)

const LayoutWrapper = ({ children, forceLightHeader = false, fullWidth = false }) => {
  const titleColor = 'text-sac-primary-blue dark:text-inherit'
  return (
    <div className="flex flex-col min-h-screen">
      <SectionContainer>
        <header className="py-10">
          <div className="flex flex-col">
            <div
              className={
                'flex items-center ' + (forceLightHeader ? 'justify-center' : 'justify-between')
              }
            >
              <div>
                <Link href="/" aria-label={siteMetadata.title}>
                  {forceLightHeader ? (
                    <div className="flex items-center justify-center">
                      <div>
                        <Image
                          src={siteMetadata.siteLogoLight}
                          alt="SAC Logo"
                          width={LOGO_WIDTH}
                          height={LOGO_FULL_HEIGHT}
                          priority
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div className="mr-3 hidden sm:block">
                        <HeaderLogo
                          lightSrc={siteMetadata.siteLogoShortLight}
                          darkSrc={siteMetadata.siteLogoShortDark}
                          height={LOGO_SHORT_HEIGHT}
                        />
                      </div>
                      <div className="mr-3 block sm:hidden">
                        <HeaderLogo
                          lightSrc={siteMetadata.siteLogoLight}
                          darkSrc={siteMetadata.siteLogoDark}
                          height={LOGO_FULL_HEIGHT}
                        />
                      </div>
                      <div
                        className={
                          titleColor +
                          ' hidden sm:block xl:pl-10 md:pl-4 h-10 xl:text-3xl md:text-2xl sm:text-xl font-semibold italic tracking-tight xl:tracking-normal'
                        }
                      >
                        {siteMetadata.headerTitle}
                      </div>
                    </div>
                  )}
                </Link>
              </div>
              {!forceLightHeader && <ThemeSwitch />}
              {!forceLightHeader && <MobileNav />}
            </div>
            {!forceLightHeader && (
              <div className="hidden xl:flex justify-center pt-4">
                <NavigationLinks />
              </div>
            )}
          </div>
        </header>
      </SectionContainer>
      <div className="flex-1">
        {fullWidth ? (
          <main>{children}</main>
        ) : (
          <SectionContainer>
            <main>{children}</main>
          </SectionContainer>
        )}
      </div>
      <SectionContainer>
        <Footer />
      </SectionContainer>
    </div>
  )
}

export default LayoutWrapper

const NavigationLinks = () => {
  const totalLinks = headerNavLinks.length
  const linksPerRow = Math.ceil(totalLinks / 2)
  const firstRowLinks = headerNavLinks.slice(0, linksPerRow)
  const secondRowLinks = headerNavLinks.slice(linksPerRow)

  return (
    <div className="flex flex-col gap-0">
      <div className="flex flex-wrap justify-center gap-4">
        {firstRowLinks.map((link) => (
          <Link
            key={link.title}
            href={link.href}
            className="p-1 font-medium text-gray-900 xl:p-4 md:py-3 dark:text-gray-100"
          >
            {link.title}
          </Link>
        ))}
      </div>
      <div className="flex flex-wrap justify-center gap-4">
        {secondRowLinks.map((link) => (
          <Link
            key={link.title}
            href={link.href}
            className="p-1 font-medium text-gray-900 xl:p-4 md:py-3 dark:text-gray-100"
          >
            {link.title}
          </Link>
        ))}
      </div>
    </div>
  )
}
