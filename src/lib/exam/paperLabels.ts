import type { BloomLevel, ExamDifficulty, ExamGroup, ExamHeader, ExamQuestionType, PaperQuestion, WrittenExam } from './types'

/** Fixed labels of the printed paper. They follow the exam's output language (TR, EN, HYW); any other language prints English. */

export type PaperLang = 'tr' | 'en' | 'hyw'

export interface PaperLabels {
  lang: PaperLang
  name: string
  className: string
  number: string
  score: string
  total: string
  tfMarks: string
  goodLuck: string
  teacherRole: string
  footer: string
  keyTitle: string
  answer: string
  expected: string
  alsoAccepted: string
  criteria: string
  true: string
  false: string
  /** The key's word for a model answer that is one example among several valid ones (evaluation and creation questions). */
  sample: string
  /** Bloom level not set. */
  notSet: string
  bloomNames: Record<BloomLevel, string>
  /** Topic distribution table: title, columns (topic, question numbers, question count, points). */
  distributionTitle: string
  distributionCols: readonly [string, string, string, string]
  /** Table of specifications: title and the topic column. */
  specTitle: string
  specTopic: string
  /** The same two tables under MEB wording (the MEB common exam format). */
  mebDistributionTitle: string
  mebSpecTitle: string
  mebTopic: string
  page: string
  /** Short prefix of a question number in the teacher's grading grid (S1, Q1) */
  qShort: string
  blank: string
  difficulty: Record<ExamDifficulty, string>
  section: Record<ExamQuestionType, string>
  yearLine: (header: ExamHeader) => string
  /** School name as printed (Turkish upper case in TR). */
  schoolLine: (header: ExamHeader) => string
  titleLine: (header: ExamHeader) => string
  groupLabel: (group: ExamGroup) => string
  /** "Süre: 40 dakika"; null when no time is set. */
  timeLine: (minutes: number | null) => string | null
  instructionLine: () => string
  pointsLabel: (points: number) => string
  mappingLine: (question: PaperQuestion) => string
  teacherLine: (header: ExamHeader) => string | null
}

export const trUpper = (value: string): string => value.toLocaleUpperCase('tr-TR')

type BaseLabels = Omit<PaperLabels, 'teacherLine'>

/** "9. SINIF"; with a section "9/A SINIFI"; other grade names keep their own words ("HAZIRLIK SINIFI", "ÜNİVERSİTE"). */
export function gradeLabelTr(header: Pick<ExamHeader, 'grade' | 'section'>): string {
  const grade = header.grade.trim().replace(/\.$/, '')
  const section = trUpper(header.section.trim())
  if (!grade) return section ? `${section} ŞUBESİ` : ''
  if (/^\d{1,2}$/.test(grade)) return section ? `${grade}/${section} SINIFI` : `${grade}. SINIF`
  if (/üniversite/iu.test(grade)) return 'ÜNİVERSİTE'
  return section ? `${trUpper(grade)}/${section} SINIFI` : `${trUpper(grade)} SINIFI`
}

const TR: BaseLabels = {
  lang: 'tr',
  name: 'Ad Soyad',
  className: 'Sınıf',
  number: 'No',
  score: 'Puan',
  total: 'Toplam',
  tfMarks: '( D ) ( Y )',
  goodLuck: 'Başarılar dilerim.',
  teacherRole: 'Ders Öğretmeni',
  footer: 'Quelio ile hazırlandı',
  keyTitle: 'CEVAP ANAHTARI',
  answer: 'Cevap',
  expected: 'Beklenen cevap',
  alsoAccepted: 'Kabul edilebilir',
  criteria: 'Puanlama ölçütleri',
  true: 'Doğru',
  false: 'Yanlış',
  sample: 'Örnek cevap',
  notSet: 'Belirtilmedi',
  bloomNames: { 1: 'Hatırlama', 2: 'Anlama', 3: 'Uygulama', 4: 'Analiz', 5: 'Değerlendirme', 6: 'Yaratma' },
  distributionTitle: 'Konu-soru dağılım tablosu',
  distributionCols: ['Konu / kazanım', 'Soru numaraları', 'Soru sayısı', 'Puan'],
  specTitle: 'Belirtke tablosu',
  specTopic: 'Konu',
  mebDistributionTitle: 'Kazanım-Soru Dağılım Tablosu',
  mebSpecTitle: 'Belirtke Tablosu (Kazanım × Bilişsel Düzey)',
  mebTopic: 'Kazanım / öğrenme çıktısı',
  page: 'Sayfa',
  qShort: 'S',
  blank: 'boşluk',
  difficulty: { easy: 'Kolay', medium: 'Orta', hard: 'Zor' },
  section: {
    'open-ended': 'Aşağıdaki soruları cevaplayınız.',
    'short-answer': 'Aşağıdaki soruları kısaca cevaplayınız.',
    'fill-blanks': 'Aşağıdaki cümlelerdeki boşlukları uygun ifadelerle doldurunuz.',
    'true-false': 'Aşağıdaki ifadeler doğru ise (D), yanlış ise (Y) harfini yuvarlak içine alınız.',
    mcq: 'Aşağıdaki soruların doğru seçeneğini işaretleyiniz.',
    matching: 'Sol sütundaki ifadeleri sağ sütundaki karşılıklarıyla eşleştiriniz; harfi boşluğa yazınız.',
  },
  yearLine: (header) => `${header.academicYear} EĞİTİM ÖĞRETİM YILI`,
  schoolLine: (header) => trUpper(header.school.trim()),
  titleLine: (header) => {
    const grade = gradeLabelTr(header)
    const course = header.course.trim() ? `${trUpper(header.course.trim())} DERSİ ` : ''
    return `${grade ? `${grade} ` : ''}${course}${header.term}. DÖNEM ${header.examNo}. YAZILI SINAVI`
  },
  groupLabel: (group) => `${group} GRUBU`,
  timeLine: (minutes) => (minutes ? `Süre: ${minutes} dakika` : null),
  instructionLine: () => 'Her sorunun puanı yanında yazılıdır.',
  pointsLabel: (points) => `(${points} puan)`,
  mappingLine: (question) => `B ${question.number}. soru = A ${question.aNumber}. soru`,
}

const EN: BaseLabels = {
  lang: 'en',
  name: 'Name',
  className: 'Class',
  number: 'No',
  score: 'Score',
  total: 'Total',
  tfMarks: '( T ) ( F )',
  goodLuck: 'Good luck.',
  teacherRole: 'Teacher',
  footer: 'Made with Quelio',
  keyTitle: 'ANSWER KEY',
  answer: 'Answer',
  expected: 'Expected answer',
  alsoAccepted: 'Also accepted',
  criteria: 'Grading criteria',
  true: 'True',
  false: 'False',
  sample: 'Sample answer',
  notSet: 'Not set',
  bloomNames: { 1: 'Remember', 2: 'Understand', 3: 'Apply', 4: 'Analyze', 5: 'Evaluate', 6: 'Create' },
  distributionTitle: 'Topic distribution',
  distributionCols: ['Topic / outcome', 'Question numbers', 'Questions', 'Points'],
  specTitle: 'Table of specifications',
  specTopic: 'Topic',
  mebDistributionTitle: 'Outcome distribution',
  mebSpecTitle: 'Table of specifications (outcome × cognitive level)',
  mebTopic: 'Learning outcome',
  page: 'Page',
  qShort: 'Q',
  blank: 'blank',
  difficulty: { easy: 'Easy', medium: 'Medium', hard: 'Hard' },
  section: {
    'open-ended': 'Answer the questions below.',
    'short-answer': 'Answer the questions below briefly.',
    'fill-blanks': 'Fill in the blanks in the sentences below with suitable words.',
    'true-false': 'Circle (T) if the statement is true and (F) if it is false.',
    mcq: 'Mark the correct option for each question.',
    matching: 'Match each item in the left column with its counterpart in the right column; write the letter in the blank.',
  },
  yearLine: (header) => `${header.academicYear} ACADEMIC YEAR`,
  schoolLine: (header) => header.school.trim(),
  titleLine: (header) => {
    const course = header.course.trim() ? `${header.course.trim().toLocaleUpperCase('en')} – ` : ''
    const section = header.section.trim() ? `/${header.section.trim().toLocaleUpperCase('en')}` : ''
    const grade = header.grade.trim() ? `GRADE ${header.grade.trim().toLocaleUpperCase('en')}${section} – ` : ''
    return `${course}${grade}TERM ${header.term} – WRITTEN EXAM ${header.examNo}`
  },
  groupLabel: (group) => `GROUP ${group}`,
  timeLine: (minutes) => (minutes ? `Time: ${minutes} minutes` : null),
  instructionLine: () => 'The points for each question are shown next to it.',
  pointsLabel: (points) => `(${points} ${points === 1 ? 'point' : 'points'})`,
  mappingLine: (question) => `B question ${question.number} = A question ${question.aNumber}`,
}

/** Western Armenian, classical orthography. Flagged for native-speaker review like the rest of the HYW text. */
const HYW: BaseLabels = {
  lang: 'hyw',
  name: 'Անուն Մականուն',
  className: 'Դասարան',
  number: 'Թիւ',
  score: 'Նիշ',
  total: 'Ընդամէնը',
  tfMarks: '( Ճ ) ( Ս )',
  goodLuck: 'Յաջողութիւն կը մաղթեմ։',
  teacherRole: 'Դասի ուսուցիչ',
  footer: 'Պատրաստուած է Quelio-ով',
  keyTitle: 'ՊԱՏԱՍԽԱՆԱԳԻՐ',
  answer: 'Պատասխան',
  expected: 'Ակնկալուած պատասխան',
  alsoAccepted: 'Ընդունելի է նաեւ',
  criteria: 'Գնահատման չափանիշներ',
  true: 'Ճիշդ',
  false: 'Սխալ',
  sample: 'Օրինակ պատասխան',
  notSet: 'Նշուած չէ',
  bloomNames: { 1: 'Յիշել', 2: 'Հասկնալ', 3: 'Կիրառել', 4: 'Վերլուծել', 5: 'Գնահատել', 6: 'Ստեղծել' },
  distributionTitle: 'Նիւթերու բաշխում',
  distributionCols: ['Նիւթ / նպատակ', 'Հարցերու թիւեր', 'Հարցերու քանակ', 'Նիշ'],
  specTitle: 'Յատկանիշերու աղիւսակ',
  specTopic: 'Նիւթ',
  mebDistributionTitle: 'Նպատակներու բաշխում',
  mebSpecTitle: 'Յատկանիշերու աղիւսակ (նպատակ × մակարդակ)',
  mebTopic: 'Ուսումնական նպատակ',
  page: 'Էջ',
  qShort: 'Հ',
  blank: 'բաց',
  difficulty: { easy: 'Դիւրին', medium: 'Միջին', hard: 'Դժուար' },
  section: {
    'open-ended': 'Պատասխանեցէք վարի հարցումներուն։',
    'short-answer': 'Համառօտ պատասխանեցէք վարի հարցումներուն։',
    'fill-blanks': 'Լրացուցէք վարի նախադասութիւններու բացերը յարմար բառերով։',
    'true-false': 'Եթէ պնդումը ճիշդ է, շրջանակի մէջ առէք (Ճ), եթէ սխալ է՝ (Ս) տառը։',
    mcq: 'Նշեցէք իւրաքանչիւր հարցումի ճիշդ տարբերակը։',
    matching: 'Ձախ սիւնակի իւրաքանչիւր արտայայտութիւնը համապատասխանեցուցէք աջ սիւնակի իր զոյգին. տառը գրեցէք բացին մէջ։',
  },
  yearLine: (header) => `${header.academicYear} ԴԱՍԱՒԱՆԴԱԿԱՆ ՏԱՐԻ`,
  schoolLine: (header) => header.school.trim(),
  titleLine: (header) => {
    const course = header.course.trim() ? `${header.course.trim().toLocaleUpperCase('hy')} – ` : ''
    const section = header.section.trim() ? `/${header.section.trim()}` : ''
    const grade = header.grade.trim() ? `${header.grade.trim()}${section}. ԴԱՍԱՐԱՆ – ` : ''
    return `${course}${grade}${header.term}. ԿԷՍՏԱՐ – ԳՐԱՒՈՐ ՔՆՆՈՒԹԻՒՆ ${header.examNo}`
  },
  groupLabel: (group) => `ԽՈՒՄԲ ${group}`,
  timeLine: (minutes) => (minutes ? `Տեւողութիւն՝ ${minutes} վայրկեան` : null),
  instructionLine: () => 'Իւրաքանչիւր հարցումի նիշը անոր քով գրուած է։',
  pointsLabel: (points) => `(${points} նիշ)`,
  mappingLine: (question) => `B ${question.number}-րդ հարց = A ${question.aNumber}-րդ հարց`,
}

function complete(base: BaseLabels): PaperLabels {
  return {
    ...base,
    teacherLine: (header) => (header.teacher.trim() ? `${header.teacher.trim()}, ${base.teacherRole}` : null),
  }
}

const LABELS: Record<PaperLang, PaperLabels> = { tr: complete(TR), en: complete(EN), hyw: complete(HYW) }

export const paperLabels = (lang: PaperLang): PaperLabels => LABELS[lang]

/** Output language "auto" follows the written text: Armenian script → HYW, Turkish letters or words → TR, anything else → EN. */
export function detectPaperLang(sample: string): PaperLang {
  if (/[Ա-֏]/.test(sample)) return 'hyw'
  if (/[çğıöşüÇĞİÖŞÜ]/.test(sample) || /\b(ve|bir|bu|için|ile|olan|olarak|değil|nedir|hangi)\b/i.test(sample)) return 'tr'
  return 'en'
}

/** Language of the paper's labels for an exam: the chosen output language, else read from the questions. */
export function examPaperLang(exam: Pick<WrittenExam, 'settings' | 'questions'>): PaperLang {
  const code = exam.settings.outputLanguage
  if (code === 'tr' || code === 'en' || code === 'hyw') return code
  if (code !== 'auto') return 'en'
  const sample = exam.questions.map((question) => `${question.stem} ${question.answer} ${question.topic}`).join(' ')
  return sample.trim() ? detectPaperLang(sample) : 'tr'
}

export const examPaperLabels = (exam: Pick<WrittenExam, 'settings' | 'questions'>): PaperLabels => paperLabels(examPaperLang(exam))
