import { slug } from 'github-slugger'

/**
 * Tag text -> URL slug. Always pure ASCII.
 *
 * github-slugger preserves accents, which produced tag URLs like
 * /tags/astronom%C3%ADa. Those returned 404 in production for every accented
 * tag, while plain-ASCII tags served fine: the percent-decoded path the route
 * received did not compare equal to kebabCase(storedTag). Probing the two
 * Unicode forms of the same tag gave 404 for NFC and 500 for NFD, so the
 * mismatch happens in the platform path handling rather than in this codebase.
 *
 * Rather than chase that, slugs are now de-accented. It removes the entire
 * class of normalisation bug, and gives cleaner URLs as a side effect.
 *
 * Accents are stripped ONLY here, in the URL layer. The stored tag keeps them,
 * because that string is display text shown to Spanish readers: bolido with an
 * accent renders accented but links to /tags/bolido.
 *
 * Safe to change: the accented URLs this replaces were already 404, so there is
 * nothing indexed at them to break.
 */
const kebabCase = (str) =>
  slug(
    String(str ?? '')
      .normalize('NFD')
      // Combining diacritical marks, left behind by NFD decomposition.
      .replace(/[\u0300-\u036f]/g, '')
      .normalize('NFC')
  )

export default kebabCase
