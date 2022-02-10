import SocialIcon from '@/components/social-icons'
import Image from '@/components/Image'
import { MDXLayoutRenderer } from '@/components/MDXComponents'

export default function AuthorListLayout({ about, authors }) {
  return (
    <div className="grid md:grid-cols-1">
      <AboutCard {...about} />

      <div className="divide-y">
        <div className="mt-10 pt-6 pb-8 space-y-2 md:space-y-5">
          <h1 className="text-xl font-extrabold leading-9 tracking-tight text-gray-900 dark:text-gray-100 sm:text-4xl sm:leading-10 md:text-6xl md:leading-14 md:px-6">
            Junta de Directores
          </h1>
        </div>
        <div className="pt-8 items-start">
          {authors.map(({ frontMatter }) => ProfileCard(frontMatter))}
        </div>
      </div>
    </div>
  )
}

function AboutCard({ mdxSource, frontMatter }) {
  return (
    <MDXLayoutRenderer layout={'AboutCardLayout'} mdxSource={mdxSource} frontMatter={frontMatter} />
  )
}

function ProfileCard({ name, avatar, occupation, bio, company, email, linkedin, twitter }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 pl-4 pt-4 m-4 bg-gray-50 dark:bg-gray-100 rounded shadow-lg dark:shadow-dark">
      <div className="md:col-span-1">
        <Image src={avatar} alt="avatar" width="192px" height="192px" className="rounded-full" />
      </div>
      <div className="md:col-span-3 md:ml-4">
        <h3 className="pt-4 pb-2 text-2xl font-bold leading-8 tracking-tight text-gray-800">
          {name}
        </h3>
        <div className="text-gray-800 mb-2">{occupation}</div>
        <div className="text-gray-500 mr-4">{bio}</div>
        <div className="text-gray-500">{company}</div>
        <div className="flex pt-6 space-x-3">
          <SocialIcon kind="mail" href={`mailto:${email}`} />
          <SocialIcon kind="linkedin" href={linkedin} />
          <SocialIcon kind="twitter" href={twitter} />
        </div>
      </div>
    </div>
  )
}
