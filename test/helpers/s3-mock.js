/**
 * Shared jest mock for `@aws-sdk/client-s3`.
 *
 * The v3 SDK has one `send(command)` entry point, so a test cannot spy on a
 * per-operation method the way it could with v2. This helper mocks the module
 * with command classes that keep their input, plus helpers to read back which
 * command was sent and with what.
 *
 * Usage:
 *   jest.mock('@aws-sdk/client-s3', () => require('./helpers/s3-mock').clientS3Mock())
 *   const { routeSend, lastInput, jsonBody } = require('./helpers/s3-mock')
 */

const mockSend = jest.fn()

const COMMANDS = [
  'GetObjectCommand',
  'PutObjectCommand',
  'DeleteObjectCommand',
  'DeleteObjectsCommand',
  'CopyObjectCommand',
  'HeadObjectCommand',
  'ListObjectsV2Command',
]

/** The mocked module. Pass it from a `jest.mock` factory. */
function clientS3Mock() {
  const mod = { S3Client: jest.fn(() => ({ send: mockSend })) }
  for (const name of COMMANDS) {
    // `commandName` identifies the operation. Class names do not survive the
    // babel transform, so the tag is explicit.
    mod[name] = function (input) {
      this.commandName = name
      this.input = input
    }
  }
  return mod
}

/** Inputs of every command of this type sent through the mock, in order. */
function sentInputs(name) {
  return mockSend.mock.calls.filter(([cmd]) => cmd.commandName === name).map(([cmd]) => cmd.input)
}

/** Input of the last command of this type, or undefined. */
function lastInput(name) {
  const all = sentInputs(name)
  return all[all.length - 1]
}

/** How many commands of this type were sent. */
function sentCount(name) {
  return sentInputs(name).length
}

/**
 * Route `send()` by command name. A handler is either a value to resolve or a
 * function of the command input. Commands with no handler resolve to `{}`.
 */
function routeSend(handlers) {
  mockSend.mockImplementation(async (cmd) => {
    const handler = handlers[cmd.commandName]
    if (typeof handler === 'function') return handler(cmd.input)
    if (handler !== undefined) return handler
    return {}
  })
}

/** A GetObject response whose body reads back as this JSON. */
function jsonBody(data) {
  return { Body: { transformToString: async () => JSON.stringify(data) } }
}

/** An error the SDK would throw for a missing key. */
function noSuchKey() {
  const error = new Error('NoSuchKey')
  error.name = 'NoSuchKey'
  return error
}

module.exports = {
  mockSend,
  clientS3Mock,
  sentInputs,
  lastInput,
  sentCount,
  routeSend,
  jsonBody,
  noSuchKey,
}
