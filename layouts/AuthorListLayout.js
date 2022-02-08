import SocialIcon from '@/components/social-icons'
import Image from '@/components/Image'

export default function AuthorListLayout({ authors }) {
  return (
    <div className="grid md:grid-cols-1">
      {authors.map(({ frontMatter }) => Profile(frontMatter))}
    </div>
  )
}

function Profile({ name, avatar, occupation, bio, company, email, github, linkedin, twitter }) {
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
        <div className="text-gray-500">{bio}</div>
        <div className="text-gray-500">{company}</div>
        <div className="flex pt-6 space-x-3">
          <SocialIcon kind="mail" href={`mailto:${email}`} />
          <SocialIcon kind="github" href={github} />
          <SocialIcon kind="linkedin" href={linkedin} />
          <SocialIcon kind="twitter" href={twitter} />
        </div>
      </div>
    </div>
  )
}
