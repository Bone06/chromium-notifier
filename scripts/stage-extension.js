import {
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  rm
} from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const releaseFilesPath = resolve(root, 'release-files.json')
const defaultOutput = resolve(root, 'build', 'extension')

export const readReleaseFiles = async () => {
  const files = JSON.parse(await readFile(releaseFilesPath, 'utf8'))
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error('release-files.json must contain a non-empty array')
  }

  const uniqueFiles = new Set(files)
  if (uniqueFiles.size !== files.length) {
    throw new Error('release-files.json contains duplicate paths')
  }
  if ([...files].sort().some((file, index) => file !== files[index])) {
    throw new Error('release-files.json paths must be sorted')
  }

  for (const file of files) {
    if (
      typeof file !== 'string' ||
      file.length === 0 ||
      file.includes('\\') ||
      file.startsWith('/') ||
      file.split('/').includes('..')
    ) {
      throw new Error(`Unsafe release path: ${file}`)
    }
  }
  return files
}

export const stageExtension = async ({ output, files = undefined } = {}) => {
  if (!output) throw new Error('A staging output directory is required')
  const releaseFiles = files || await readReleaseFiles()
  await mkdir(output, { recursive: true })
  if ((await readdir(output)).length !== 0) {
    throw new Error(`Staging output must be empty: ${output}`)
  }

  for (const relativePath of releaseFiles) {
    const source = resolve(root, relativePath)
    const sourceInfo = await lstat(source)
    if (!sourceInfo.isFile() || sourceInfo.isSymbolicLink()) {
      throw new Error(`Release input must be a regular file: ${relativePath}`)
    }
    const destination = resolve(output, relativePath)
    await mkdir(dirname(destination), { recursive: true })
    await copyFile(source, destination)
  }
  return releaseFiles
}

const isDirectRun = process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isDirectRun) {
  await rm(defaultOutput, { recursive: true, force: true })
  const files = await stageExtension({ output: defaultOutput })
  console.log(`Staged ${files.length} extension files in ${defaultOutput}.`)
}
