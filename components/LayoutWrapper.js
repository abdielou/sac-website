'use client'

import siteMetadata from '@/data/siteMetadata'
import headerNavLinks from '@/data/headerNavLinks'
import Image from 'next/image'
import Link from './Link'
import SectionContainer from './SectionContainer'
import Footer from './Footer'
import MobileNav from './MobileNav'
import ThemeSwitch from './ThemeSwitch'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'

const LayoutWrapper = ({ children, forceLightHeader = false, fullWidth = false }) => {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const { theme, resolvedTheme } = useTheme()
  const show = forceLightHeader || mounted
  const isLight = forceLightHeader || theme === 'light' || resolvedTheme === 'light'
  const logoShort =
    show && (isLight ? siteMetadata.siteLogoShortLight : siteMetadata.siteLogoShortDark)
  const logo = show && (isLight ? siteMetadata.siteLogoLight : siteMetadata.siteLogoDark)
  const titleColor = show && (isLight ? 'text-sac-primary-blue' : '')
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
                  {show &&
                    (forceLightHeader ? (
                      <div className="flex items-center justify-center">
                        <div>
                          <Image src={logo} alt="SAC Logo" width={200} height={70} />
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <div className="mr-3 hidden sm:block">
                          <Image src={logoShort} alt="SAC Logo" width={200} height={47} />
                        </div>
                        <div className="mr-3 block sm:hidden">
                          <Image src={logo} alt="SAC Logo" width={200} height={70} />
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
                    ))}
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
