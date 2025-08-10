import fs from 'node:fs/promises'
import path from 'node:path'
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'

const inputPath = path.resolve('public/docs/reidcollins.pdf')
const outputPath = path.resolve('public/docs/reidcollins.txt')

async function extractTextFromPage(pdf, pageNum) {
  const page = await pdf.getPage(pageNum)
  const content = await page.getTextContent()
  const strings = content.items.map((item) => ('str' in item ? item.str : ''))
  return strings.join(' ').replace(/\s+/g, ' ').trim()
}

async function main() {
  try {
    const data = await fs.readFile(inputPath)
    const uint8 = new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
    const loadingTask = pdfjsLib.getDocument({ data: uint8, useWorker: false })
    const pdf = await loadingTask.promise
    const pages = pdf.numPages
    const parts = []
    for (let i = 1; i <= pages; i += 1) {
      const text = await extractTextFromPage(pdf, i)
      parts.push(text)
    }
    const finalText = parts.join('\n\n--- PAGE BREAK ---\n\n')
    await fs.writeFile(outputPath, finalText, 'utf8')
    console.log(`Extracted text -> ${outputPath}`)
    console.log(`Pages: ${pages}`)
  } catch (err) {
    console.error('Failed to extract PDF:', err)
    process.exitCode = 1
  }
}

main()


