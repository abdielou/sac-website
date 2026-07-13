const React = require('react')

function SvgMock(props) {
  return React.createElement('svg', props)
}

module.exports = SvgMock
module.exports.default = SvgMock

