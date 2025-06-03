const siteMetadata = {
  title: 'Sociedad de Astronomia del Caribe',
  author: 'SAC',
  headerTitle: 'Sociedad de Astronomia del Caribe',
  headerTitleAbbrev: 'SAC',
  description:
    'Una organización sin fines de lucro compuesta por profesionales, estudiantes y personas de la comunidad que comparten el interés y la pasión por la Astronomía.',
  language: 'es-pr',
  siteUrl: 'https://sac-website.vercel.app/',
  siteRepo: 'https://github.com/abdielou/sac-website',
  // siteLogoLight: '/static/images/sac-main-logo.png',
  // siteLogoShortLight: '/static/images/sac-main-short-logo.png',
  // siteLogoDark: '/static/images/sac-white-logo.png',
  // siteLogoShortDark: '/static/images/sac-white-short-logo.png',
  siteLogoLight: '/static/images/sac-main-logo-25.svg',
  siteLogoShortLight: '/static/images/sac-main-short-logo-25.svg',
  siteLogoDark: '/static/images/sac-white-logo-25.svg',
  siteLogoShortDark: '/static/images/sac-white-short-logo-25.svg',
  image: '/static/images/avatar.png',
  socialBanner: '/static/images/sac-white-logo.png',
  email: 'info@sociedadastronomia.com',
  twitter: 'https://twitter.com/soc_astrocaribe',
  facebook: 'https://www.facebook.com/sociedad.astronomia',
  youtube: 'https://www.youtube.com/@sociedadastronomia/',
  // linkedin: 'https://www.linkedin.com',
  locale: 'es-PR',
  forms: {
    membership: 'https://forms.gle/JMURhc6PaC1hgQg18',
    event: 'https://my.forms.app/form/6205262c015f7839d8439ca9',
  },
  payments: {
    donatePaypal: 'https://www.paypal.com/donate/?hosted_button_id=XTV76Q6ESKNE4',
    payAthMovil: 'https://athmovil.com/pay/787-306-3664',
    payAthMovilQR: '/static/images/athmovil_sac.png',
  },
  analytics: {
    googleAnalyticsId: 'G-8D0KS7FXMR',
  },
  newsletter: {
    // supports mailchimp, buttondown, convertkit
    // Please add your .env file and modify it according to your selection
    // provider: 'buttondown',
  },
  comment: {
    // Select a provider and use the environment variables associated to it
    // https://vercel.com/docs/environment-variables
    provider: 'giscus', // supported providers: giscus, utterances, disqus
    giscusConfig: {
      // Visit the link below, and follow the steps in the 'configuration' section
      // https://giscus.app/
      repo: process.env.NEXT_PUBLIC_GISCUS_REPO,
      repositoryId: process.env.NEXT_PUBLIC_GISCUS_REPOSITORY_ID,
      category: process.env.NEXT_PUBLIC_GISCUS_CATEGORY,
      categoryId: process.env.NEXT_PUBLIC_GISCUS_CATEGORY_ID,
      mapping: 'pathname', // supported options: pathname, url, title
      reactions: '1', // Emoji reactions: 1 = enable / 0 = disable
      // Send discussion metadata periodically to the parent window: 1 = enable / 0 = disable
      metadata: '0',
      // theme example: light, dark, dark_dimmed, dark_high_contrast
      // transparent_dark, preferred_color_scheme, custom
      theme: 'light',
      // theme when dark mode
      darkTheme: 'transparent_dark',
      // If the theme option above is set to 'custom`
      // please provide a link below to your custom theme css file.
      // example: https://giscus.app/themes/custom_example.css
      themeURL: '',
    },
    utterancesConfig: {
      // Visit the link below, and follow the steps in the 'configuration' section
      // https://utteranc.es/
      repo: process.env.NEXT_PUBLIC_UTTERANCES_REPO,
      issueTerm: '', // supported options: pathname, url, title
      label: '', // label (optional): Comment 💬
      // theme example: github-light, github-dark, preferred-color-scheme
      // github-dark-orange, icy-dark, dark-blue, photon-dark, boxy-light
      theme: '',
      // theme when dark mode
      darkTheme: '',
    },
    disqusConfig: {
      // https://help.disqus.com/en/articles/1717111-what-s-a-shortname
      shortname: process.env.NEXT_PUBLIC_DISQUS_SHORTNAME,
    },
  },
}

module.exports = siteMetadata
