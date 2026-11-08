import { readFileSync } from 'node:fs'
import path from 'node:path'

const sourceDirectory = path.join(process.cwd(), 'content/legal')

export function readLegalSource(file: 'policy.txt' | 'form.txt' | 'cookie.txt') {
  return readFileSync(path.join(sourceDirectory, file), 'utf8').trimEnd()
}
