const fs = require('fs')
var glob = require('glob')

;(async () => {
  glob('data/blog/**/*.md', function (er, files) {
    files.forEach((file) => {
      const baseUrlRegex = /\{\{site\.baseurl\}\}\/public/g
      const content = fs.readFileSync(file, 'utf8')
      if (content.match(baseUrlRegex)) {
        const newContent = content.replace(baseUrlRegex, '')
        fs.writeFileSync(file, newContent, 'utf8')
      }
    })
  })
})()
