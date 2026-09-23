import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import * as sass from 'sass'

const sourceUrl = new URL('../styles.scss', import.meta.url)
const outputUrl = new URL('../styles.css', import.meta.url)

export const compileStyles = () => {
  const css = sass.compile(fileURLToPath(sourceUrl), {
    sourceMap: false,
    style: 'expanded'
  }).css
  return css.endsWith('\n') ? css : `${css}\n`
}

const generatedCss = compileStyles()

if (process.argv.includes('--check')) {
  const committedCss = await readFile(outputUrl, 'utf8')
  if (committedCss !== generatedCss) {
    throw new Error(
      'styles.css is out of date. Run `npm run build:css` and commit the result.'
    )
  }
  console.log('styles.css is up to date.')
} else {
  await writeFile(outputUrl, generatedCss)
  console.log('Generated styles.css from styles.scss.')
}
