/**
 * Extract one JPEG frame from a video file using FFmpeg (installed on server / PATH).
 *
 * Uses `child_process` + `util.promisify` instead of `node:child_process/promises`
 * for compatibility with older Node runtimes used in some build workers.
 */

import { execFile as execFileCallback } from 'child_process'
import { promisify } from 'util'

const execFile = promisify(execFileCallback)

/** @returns {string} Executable name or absolute path */
export function getFfmpegCommand() {
  return (process.env.FFMPEG_PATH || 'ffmpeg').trim()
}

/** @returns {Promise<boolean>} */
export async function isFfmpegAvailable() {
  try {
    const bin = getFfmpegCommand()
    await execFile(bin, ['-hide_banner', '-nostdin', '-loglevel', 'error', '-version'], {
      timeout: 8000,
      windowsHide: true,
    })
    return true
  } catch {
    return false
  }
}

/**
 * Writes a single JPEG frame to `outputJpegPath`.
 */
export async function extractFrameToJpegFile(videoInputPath, outputJpegPath, seekSeconds = 0.5) {
  const bin = getFfmpegCommand()
  await execFile(
    bin,
    [
      '-hide_banner',
      '-nostdin',
      '-y',
      '-loglevel',
      'error',
      '-ss',
      String(seekSeconds),
      '-i',
      videoInputPath,
      '-frames:v',
      '1',
      '-q:v',
      '3',
      outputJpegPath,
    ],
    { timeout: 180000, windowsHide: true }
  )
}
