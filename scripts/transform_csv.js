const fs = require('fs')
const csv = require('csv-parse/sync')
const { stringify } = require('csv-stringify/sync')

// Configure your column mappings here
const columnMappings = [
  {
    sourceColumn: '',
    targetColumn: 'Group Email [Required]',
    staticValue: 'members_personal@sociedadastronomia.com',
  },
  {
    sourceColumns: [
      {
        column: 'E-mail 1 - Value',
        excludePattern: 'sociedadastronomia.com',
      },
      {
        column: 'E-mail 2 - Value',
      },
    ],
    targetColumn: 'Member Email',
  },
  {
    sourceColumn: 'Member Type',
    targetColumn: 'Member Type',
    staticValue: 'User',
  },
  {
    sourceColumn: '',
    targetColumn: 'Member Role',
    staticValue: 'Member',
  },
]

// Read the input CSV file
const inputFile = 'source.csv'
const outputFile = 'transformed_output.csv'

try {
  // Read and parse the input CSV
  const inputData = fs.readFileSync(inputFile, 'utf-8')
  const records = csv.parse(inputData, { columns: true, skip_empty_lines: true })

  // Transform the data using the mappings
  const transformedData = records.map((record) => {
    const transformedRecord = {}
    for (const mapping of columnMappings) {
      if (mapping.staticValue !== undefined) {
        transformedRecord[mapping.targetColumn] = mapping.staticValue
      } else if (mapping.sourceColumns) {
        // Handle multiple source columns with exclusion patterns
        let value = null
        for (const source of mapping.sourceColumns) {
          const sourceValue = record[source.column]
          if (sourceValue !== undefined) {
            if (!source.excludePattern || !sourceValue.includes(source.excludePattern)) {
              value = sourceValue
              break
            }
          }
        }
        if (value !== null) {
          transformedRecord[mapping.targetColumn] = value
        }
      } else if (record[mapping.sourceColumn] !== undefined) {
        transformedRecord[mapping.targetColumn] = record[mapping.sourceColumn]
      }
    }
    return transformedRecord
  })

  // Convert to CSV and write to output file
  const output = stringify(transformedData, { header: true })
  fs.writeFileSync(outputFile, output)

  console.log(`Transformation complete! Output saved to ${outputFile}`)
} catch (error) {
  console.error('Error:', error.message)
}
