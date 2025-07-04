module.exports = {
  semi: false,
  singleQuote: true,
  printWidth: 100,
  tabWidth: 2,
  useTabs: false,
  trailingComma: 'es5',
  bracketSpacing: true,
  overrides: [
    {
      files: '*.gs',
      options: {
        parser: 'babel',
      },
    },
  ],
}
