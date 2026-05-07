/**
 * Extract one JPEG frame from a video file using FFmpeg (installed on server / PATH).
 */

import { execFile } from 'node:child_process/promises'

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
