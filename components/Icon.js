import ArrowLeft from './social-icons/arrow-left.svg'
import ArrowRight from './social-icons/arrow-right.svg'

const components = {
  arrowLeft: ArrowLeft,
  arrowRight: ArrowRight,
}

const Icon = ({ kind, size = 8, className = '' }) => {
  const IconSvg = components[kind]

  if (!IconSvg) return null

  return <IconSvg className={`fill-current h-${size} w-${size} ${className}`} />
}

export default Icon
