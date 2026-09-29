import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { handleGenerateRequest } from '../api/_lib/generate.js'
import { isGeneratedQuiz } from '../src/lib/quiz.js'

/** Loads .env.local into process.env without overriding anything already set (e.g. by the shell invocation itself). */
function loadDotEnvLocal(): void {
  const path = resolve(process.cwd(), '.env.local')
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const separatorIndex = trimmed.indexOf('=')
    if (separatorIndex === -1) continue
    const key = trimmed.slice(0, separatorIndex).trim()
    const value = trimmed.slice(separatorIndex + 1).trim()
    if (key && process.env[key] === undefined) {
      process.env[key] = value
    }
  }
}

const SAMPLE_TEXT_TR = `
Kurtuluş Savaşı, 1919'dan 1923'e kadar süren ve Türk milletinin bağımsızlığını kazandığı bir dönemdir.
Mustafa Kemal Atatürk, 19 Mayıs 1919'da Samsun'a çıkarak millî mücadeleyi başlattı.
Kongreler yoluyla halkın örgütlenmesi sağlandı; Erzurum ve Sivas kongreleri bu sürecin önemli adımlarıydı.
Türkiye Büyük Millet Meclisi 23 Nisan 1920'de Ankara'da açıldı ve millî iradeyi temsil etti.
Sakarya Meydan Muharebesi ve ardından Büyük Taarruz, savaşın kaderini belirleyen dönüm noktaları oldu.
30 Ağustos 1922'deki Başkomutanlık Meydan Muharebesi'nde düşman kuvvetleri kesin bir yenilgiye uğratıldı.
Savaş, 24 Temmuz 1923'te imzalanan Lozan Antlaşması ile sona erdi ve Türkiye'nin bağımsızlığı uluslararası alanda tanındı.
`.trim()

async function main(): Promise<void> {
  loadDotEnvLocal()

  const start = Date.now()
  const { status, body } = await handleGenerateRequest({
    mode: 'generate',
    text: SAMPLE_TEXT_TR,
    questionType: 'mcq',
    questionCount: '5',
    difficulty: 'medium',
    optionsCount: '4',
    outputLanguage: 'auto',
    uiLanguage: 'tr',
  })
  const duration = Date.now() - start

  if (status !== 200 || 'error' in body) {
    const errorCode = 'error' in body ? body.error : 'unknown'
    console.log(`provider=n/a fallbackUsed=n/a validQuestions=0 duration=${duration}ms status=FAIL (${errorCode})`)
    process.exitCode = 1
    return
  }

  if (body.provider === 'demo') {
    console.log(`provider=demo fallbackUsed=false duration=${duration}ms status=SKIPPED (no ANTHROPIC_API_KEY or OPENAI_API_KEY configured)`)
    return
  }

  const validQuestionCount = isGeneratedQuiz(body) ? body.questions.length : 0
  const pass = validQuestionCount > 0
  console.log(
    `provider=${body.provider} fallbackUsed=${body.fallbackUsed} validQuestions=${validQuestionCount} duration=${duration}ms status=${pass ? 'PASS' : 'FAIL'}`,
  )
  if (!pass) process.exitCode = 1
}

void main()
