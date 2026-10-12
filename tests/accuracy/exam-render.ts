import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'

import { chromium } from '@playwright/test'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'

import { buildExamDocx } from '../../src/lib/exam/docx'
import type { WrittenExam } from '../../src/lib/exam/types'

// Renders the exams of the audit into the folders of ../QUELIO-TEST-EXAM: exam PDF, key PDF, exam DOCX and a picture of the DOCX as LibreOffice draws it.
// Usage: npx tsx tests/accuracy/exam-render.ts <folder/variant> [...]     e.g. biyoloji-9/default
// LibreOffice hangs on Word equations in this environment, so for the picture only the equations are replaced by their plain text (the DOCX file itself keeps them).

const OUT = '../QUELIO-TEST-EXAM'
const PORT = 5195
const SOFFICE = 'C:/Program Files/LibreOffice/program/soffice.exe'

async function waitForServer(): Promise<void> {
  for (let i = 0; i < 80; i += 1) {
    try {
      if ((await fetch(`http://localhost:${PORT}`)).ok) return
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
  }
  throw new Error('dev server did not start')
}

function withoutEquations(docx: Uint8Array): Uint8Array {
  const parts = unzipSync(docx)
  const xml = strFromU8(parts['word/document.xml']).replace(/<m:oMath>[\s\S]*?<\/m:oMath>/g, (match) => {
    const text = [...match.matchAll(/<m:t[^>]*>([\s\S]*?)<\/m:t>/g)].map((entry) => entry[1]).join('')
    return `<w:r><w:t xml:space="preserve">${text}</w:t></w:r>`
  })
  return zipSync({ ...parts, 'word/document.xml': strToU8(xml) })
}

function toPdf(docxPath: string, outDir: string): boolean {
  const profile = `C:/Users/pc/AppData/Local/Temp/lo-prof-${Math.random().toString(36).slice(2, 10)}`
  const run = spawnSync(SOFFICE, [`-env:UserInstallation=file:///${profile}`, '--headless', '--norestore', '--convert-to', 'pdf', '--outdir', outDir, docxPath], { timeout: 120_000, windowsHide: true })
  rmSync(profile, { recursive: true, force: true })
  return run.status === 0
}

async function main() {
  const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(PORT), '--strictPort'], { env: { ...process.env, QUELIO_NO_HMR: '1', VITE_QUELIO_FAKE_BACKEND: '1' }, stdio: 'ignore' })
  try {
    await waitForServer()
    const browser = await chromium.launch()
    const lib = readFileSync('node_modules/pdfjs-dist/legacy/build/pdf.mjs', 'utf8')
    const worker = readFileSync('node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs', 'utf8')
    for (const spec of process.argv.slice(2)) {
      const [folder, variant] = spec.split('/')
      const dir = `${OUT}/${folder}`
      mkdirSync(dir, { recursive: true })
      const exam = JSON.parse(readFileSync(`${dir}/${variant}.json`, 'utf8')) as WrittenExam
      // PDFs: the real print view, as the browser prints it.
      const page = await browser.newPage()
      await page.addInitScript((seed) => localStorage.setItem('quelio.exams.v1', JSON.stringify([seed])), exam)
      for (const [name, query] of [['exam', 'part=exam&group=A'], ['key', `part=key&group=${exam.settings.groups ? 'both' : 'A'}`]] as const) {
        await page.goto(`http://localhost:${PORT}/exams/${exam.id}/print?${query}`)
        await page.locator('[data-purpose="exam-paper"]').waitFor()
        await page.evaluate(() => document.fonts.ready)
        await page.emulateMedia({ media: 'print' })
        writeFileSync(`${dir}/${variant}-${name}.pdf`, await page.pdf({ format: 'A4', preferCSSPageSize: true, printBackground: true }))
        await page.emulateMedia({ media: 'screen' })
      }
      await page.close()
      // Word: the exam (group A), and the picture of it.
      const docx = await buildExamDocx(exam, 'exam', 'A')
      writeFileSync(`${dir}/${variant}-exam.docx`, docx)
      const work = 'C:/Users/pc/AppData/Local/Temp/lo-render'
      mkdirSync(work, { recursive: true })
      writeFileSync(`${work}/${variant}-${folder}.docx`, withoutEquations(docx))
      if (!toPdf(`${work}/${variant}-${folder}.docx`, work)) {
        console.log(`${spec}: LibreOffice could not convert the Word file`)
        continue
      }
      const pdf = readFileSync(`${work}/${variant}-${folder}.pdf`).toString('base64')
      const shot = await browser.newPage()
      await shot.setContent('<body style="margin:0"></body>')
      await shot.addScriptTag({ type: 'module', content: `${lib}\nwindow.pdfjsLib = { getDocument, GlobalWorkerOptions };` })
      await shot.waitForFunction(() => (window as unknown as { pdfjsLib?: unknown }).pdfjsLib)
      const pages = await shot.evaluate(
        async ({ data, workerCode }) => {
          const { getDocument, GlobalWorkerOptions } = (window as unknown as { pdfjsLib: { getDocument: (x: unknown) => { promise: Promise<{ numPages: number; getPage: (n: number) => Promise<{ getViewport: (o: { scale: number }) => { width: number; height: number }; render: (o: unknown) => { promise: Promise<void> } }> }> }; GlobalWorkerOptions: { workerSrc: string } } }).pdfjsLib
          GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([workerCode], { type: 'text/javascript' }))
          const doc = await getDocument({ data: Uint8Array.from(atob(data), (c) => c.charCodeAt(0)) }).promise
          const out: string[] = []
          for (let i = 1; i <= Math.min(doc.numPages, 2); i += 1) {
            const p = await doc.getPage(i)
            const viewport = p.getViewport({ scale: 1.1 })
            const canvas = document.createElement('canvas')
            canvas.width = viewport.width
            canvas.height = viewport.height
            await p.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
            out.push(canvas.toDataURL('image/png').split(',')[1])
          }
          return out
        },
        { data: pdf, workerCode: worker },
      )
      pages.forEach((b64, index) => writeFileSync(`${dir}/${variant}-docx-render-p${index + 1}.png`, Buffer.from(b64, 'base64')))
      await shot.close()
      console.log(`${spec}: pdf exam+key, docx and ${pages.length} render pictures written`)
    }
    await browser.close()
  } finally {
    spawnSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore' })
  }
}

await main()
