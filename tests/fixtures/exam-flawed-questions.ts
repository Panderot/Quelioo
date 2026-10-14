import type { ExamQuestion } from '../../src/lib/exam/types'
import { BIYOLOJI_9, OLASILIK_KISA } from './exam-audit-sources'

/** Questions of the Task 7 measurements (../QUELIO-TEST-EXAM, g7 files) as fixed data: the ones a student cannot solve from their own text, and sound ones of the same exams. */

export interface FlawCase {
  question: ExamQuestion
  /** The source the exam was written from. */
  source: string
  flaw?: 'missing' | 'ambiguous' | 'broken'
}

function written(id: string, stem: string, answer: string, source: string, flaw?: FlawCase['flaw']): FlawCase {
  const question: ExamQuestion = { id, type: 'short-answer', stem, answer, acceptableAnswers: [answer], rubric: [{ text: answer, points: 4 }], points: 4, topic: 'T', difficulty: 'easy', lines: 1, bloomLevel: 3 }
  return { question, source, ...(flaw ? { flaw } : {}) }
}

const MATH = OLASILIK_KISA.text
const BIO = BIYOLOJI_9.text

/** Cannot be solved from its own text. */
export const FLAWED: FlawCase[] = [
  // "5 hedef renkte": a broken sentence, and the colour asked is never named.
  written('f-hedef', 'Bir torbada 5 hedef renkte, 3 mavi ve 2 yeşil top vardır. Rastgele çekilen topun hedef renkte olma olasılığı nedir?', '1/2', MATH, 'broken'),
  // No colour has five balls.
  written('f-bes', 'Bir torbada 6 sarı, 4 mavi ve 2 beyaz top vardır. Rastgele çekilen topun, torbada beş adet bulunan renkte olma olasılığı kaçtır?', '\\frac{1}{2}', MATH, 'broken'),
  // Which colour is drawn twice is not said.
  written('f-aranan', 'Bir torbada 4 beyaz ve 6 siyah top vardır. Top geri konularak yapılan iki çekilişte aranan olasılık kaçtır?', '$4/25$', MATH, 'missing'),
  written('f-iki-cekilis', '5 kırmızı, 3 mavi ve 2 yeşil top bulunan bir torbada, top geri konularak yapılan iki çekiliş için olasılık kaçtır?', '$9/100$', MATH, 'missing'),
  written('f-konulmadan', 'Bir torbada 7 sarı ve 3 mor top vardır. Top geri konulmadan yapılan iki çekilişte aranan olasılık kaçtır?', '$7/15$', MATH, 'missing'),
  // A word answer. Written for this test (the Task 7 measurements had no word-key question that fails this way): the structure asked about is never named.
  written('f-yapi', 'Bu yapının adı nedir?', 'Mitokondri', BIO, 'missing'),
]

/** Sound questions of the same exams (numbers and words). */
export const SOUND: FlawCase[] = [
  written('s-yildiz', "Bir kutudaki 20 eş olasılıklı kartın 7'si yıldızlıdır. Rastgele seçilen kartın yıldızlı olma olasılığı kaçtır?", '$\\frac{7}{20}$', MATH),
  written('s-bagimsiz', 'Birinci olayın olasılığı $\\frac{2}{5}$, ikinci olayın olasılığı $\\frac{3}{4}$ ve olaylar birbirini etkilememektedir. Bu iki olayın birlikte gerçekleşme olasılığı kaçtır?', '$\\frac{3}{10}$', MATH),
  written('s-birlesim', '$P(A)=\\frac{3}{5}$, $P(B)=\\frac{1}{2}$ ve $P(A\\cap B)=\\frac{1}{5}$ olduğuna göre $P(A\\cup B)$ kaçtır?', '$\\frac{9}{10}$', MATH),
  written('s-yesil', "Bir torbada 12 top vardır ve bunların 3'ü yeşildir. Rastgele çekilen topun yeşil gelmeme olasılığı kaçtır?", '$\\frac{3}{4}$', MATH),
  written('s-sinif', 'Bir sınıfta 12 kız ve 8 erkek öğrenci vardır. Rastgele seçilen bir öğrencinin kız olma olasılığı kaçtır?', '$3/5$', MATH),
  written('s-zar', 'Bir zar atıldığında 1, 2, 3, 4, 5 ve 6 sonuçlarından istenmeyen üç sonuç bulunuyorsa, istenmeyen sonucun olasılığı kaçtır?', '$1/2$', MATH),
  written('s-geri-konmaz', 'Bir torbadan çekilen top geri konulmadan, ilk çekilişte belirli bir rengin gelme olasılığı $7/12$, ikinci çekilişte aynı rengin gelme olasılığı $6/11$ olduğuna göre, iki çekilişte de bu rengin gelme olasılığı kaçtır?', '$7/22$', MATH),
  written('s-istenen', "Bir torbada 15 top vardır ve bunların 5'i istenen renktedir. Çekilen top her çekilişten sonra geri konulduğuna göre, iki çekilişte de istenen renkte top gelme olasılığı kaçtır?", '$1/9$', MATH),
  written('s-mavi', 'Bir torbada 4 sarı, 3 mavi ve 5 beyaz top vardır. Çekilen top torbaya geri bırakılmaktadır. İlk ve ikinci çekişte mavi top elde edilme olasılığı kaçtır?', '\\frac{9}{144}', MATH),
  written('s-difuzyon', 'Maddelerin derişimin fazla olduğu ortamdan az olduğu ortama enerji harcamadan geçmesine ne ad verilir?', 'Difüzyon', BIO),
  written('s-aktif', 'Maddelerin derişimin az olduğu yerden çok olduğu yere enerji harcanarak geçmesine ne ad verilir?', 'Aktif taşıma', BIO),
  written('s-hooke', "Robert Hooke'un mantar incelemesinde küçük odacıklara verdiği ad nedir?", 'hücre', BIO),
  written('s-zar-adi', 'Bir hücreyi dış çevresinden ayıran canlı yapının adı nedir?', 'hücre zarı', BIO),
  written('s-secici', 'Bir hücre zarı bazı maddelerin geçişine izin verip bazı maddelerin geçişini engelliyorsa bu zarın özelliği nedir?', 'Seçici geçirgen', BIO),
]
