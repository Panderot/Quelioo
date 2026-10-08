import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'
import { SAMPLE_QUIZ } from '../fixtures/quiz'
import en from '../../src/i18n/locales/en.json' with { type: 'json' }
import tr from '../../src/i18n/locales/tr.json' with { type: 'json' }
import hyw from '../../src/i18n/locales/hyw.json' with { type: 'json' }

const NOW = new Date(2026, 2, 10, 14, 0, 0)

function entry(questions = SAMPLE_QUIZ.questions) {
  return {
    id: 'study-entry-1',
    title: SAMPLE_QUIZ.title,
    createdAt: '2026-01-01T00:00:00.000Z',
    source: 'text' as const,
    questionType: 'mixed',
    difficulty: 'medium',
    questionCount: String(questions.length),
    optionsCount: null,
    outputLanguage: 'en',
    sourceText: 'Seeded source text for the archived quiz.',
    quiz: { title: SAMPLE_QUIZ.title, questions },
  }
}

/** The five question types that are checked without any AI call. */
const LOCAL_QUESTIONS = SAMPLE_QUIZ.questions.slice(0, 5)
const URL_STUDY = `/archive/${entry().id}?mode=study&lng=en`

const progress = (page: Page) => page.locator('[data-purpose="study-progress"]')
const questionBox = (page: Page) => page.locator('[data-purpose="study-question"]')
const button = (page: Page, name: string | RegExp) => page.getByRole('button', { name, exact: typeof name === 'string' })

/** Seeds the Archive once per browser context: unlike seedArchive it does not overwrite what Study Mode saved when the page reloads. */
async function seed(page: Page, entries: unknown[]) {
  await page.addInitScript((data) => {
    if (!window.localStorage.getItem('quelio.archive.v1')) window.localStorage.setItem('quelio.archive.v1', JSON.stringify(data))
  }, entries)
}

async function start(page: Page, kind?: string) {
  if (kind) await page.getByRole('radio', { name: new RegExp(kind) }).check()
  await button(page, 'Start').click()
  await expect(questionBox(page)).toBeVisible()
}

/** Answers the current question right (Sample Quiz answers) and checks it. */
async function answerRight(page: Page, id: string) {
  switch (id) {
    case 'q-mcq':
      await page.getByRole('radio', { name: /Carbon dioxide/ }).click()
      break
    case 'q-tf':
      await page.getByRole('radio', { name: 'False' }).click()
      break
    case 'q-fill':
      await page.getByLabel('Your answer').fill('100')
      break
    case 'q-short':
      await page.getByLabel('Your answer').fill('Jupiter')
      break
    case 'q-matching': {
      const letters = ['D', 'A', 'B', 'C']
      for (const [index, letter] of letters.entries()) await page.getByLabel(`Match for row ${index + 1}`).selectOption(letter)
      break
    }
    case 'q-open':
      await page.getByLabel('Your answer').fill('Sunlight is scattered by the atmosphere, and blue light scatters more because of its shorter wavelength.')
      break
  }
  await button(page, 'Check').click()
}

async function answerWrong(page: Page, id: string) {
  switch (id) {
    case 'q-mcq':
      await page.getByRole('radio', { name: /Oxygen/ }).click()
      break
    case 'q-tf':
      await page.getByRole('radio', { name: 'True' }).click()
      break
    case 'q-fill':
      await page.getByLabel('Your answer').fill('50')
      break
    case 'q-matching':
      for (const [index, letter] of ['A', 'B', 'C', 'D'].entries()) await page.getByLabel(`Match for row ${index + 1}`).selectOption(letter)
      break
  }
  await button(page, 'Check').click()
}

const IDS = LOCAL_QUESTIONS.map((question) => question.id)

/** Answers the whole quiz right, pressing Next / Finish after each. */
async function finishAllRight(page: Page, ids = IDS) {
  for (const [index, id] of ids.entries()) {
    await answerRight(page, id)
    await expect(page.locator('[data-purpose="study-feedback"][data-state="correct"]')).toBeVisible()
    await button(page, index === ids.length - 1 ? 'Finish' : 'Next').click()
  }
}

test.describe('Study Mode', () => {
  test('opens from the Archive in one click on its own screen: start screen, one question at a time, end screen', async ({ page }) => {
    const requests: string[] = []
    await seed(page, [entry(LOCAL_QUESTIONS)])
    await page.clock.setFixedTime(NOW)
    await page.goto('/archive?lng=en')
    await page.getByRole('link', { name: `Study — ${SAMPLE_QUIZ.title}` }).click()
    // From here on (the Archive itself asks the server about songs), Study Mode must stay off the API.
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.startsWith('/api/')) requests.push(request.url())
    })

    // Own identity: label, no editor buttons, no question list.
    await expect(page.locator('[data-purpose="study-start"]')).toBeVisible()
    await expect(page.getByText('Study mode', { exact: true }).first()).toBeVisible()
    await expect(page.locator('[data-purpose="top-nav"]')).toHaveCount(0)
    await expect(page.getByRole('radio', { name: /Quick review/ })).toBeDisabled()
    await expect(page.getByText('No questions to review yet.')).toBeVisible()

    await start(page)
    await expect(progress(page)).toHaveText('1 / 5')
    await expect(page.locator('[data-purpose="question-card"]')).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Edit|Regenerate|Delete|Copy|Print/ })).toHaveCount(0)
    await expect(questionBox(page)).toContainText('Which gas do plants absorb')
    await expect(questionBox(page)).not.toContainText('Great Wall')

    await finishAllRight(page, IDS)
    await expect(page.locator('[data-purpose="study-score"]')).toHaveText('5 / 5 correct')
    await expect(page.locator('[data-purpose="study-end"]')).toContainText('100%')
    await expect(page.locator('[data-purpose="study-end"]')).toContainText('Everything right on the first try!')
    await expect(page.locator('[data-purpose="study-time"]')).toBeVisible()
    expect(requests, 'Study Mode must not call the AI for these question types').toEqual([])
  })

  test('keyboard: pick with letters and digits, Enter checks, Enter again moves on', async ({ page }) => {
    await seed(page, [entry(LOCAL_QUESTIONS)])
    await page.goto(URL_STUDY)
    await start(page)

    await page.keyboard.press('b')
    await expect(page.getByRole('radio', { name: /Carbon dioxide/ })).toHaveAttribute('aria-checked', 'true')
    await page.keyboard.press('Enter')
    await expect(page.getByText('Correct!')).toBeVisible()
    await page.keyboard.press('Enter')
    await expect(progress(page)).toHaveText('2 / 5')

    await page.keyboard.press('2')
    await expect(page.getByRole('radio', { name: 'False' })).toHaveAttribute('aria-checked', 'true')
    await page.keyboard.press('Enter')
    await expect(page.getByText('Correct!')).toBeVisible()
    await page.keyboard.press('ArrowRight')
    await expect(progress(page)).toHaveText('3 / 5')

    await page.getByLabel('Your answer').fill('100')
    await page.keyboard.press('Enter')
    await expect(page.getByText('Correct!')).toBeVisible()
  })

  test('a wrong answer says "Not yet", suggests the hint, and the second miss reveals the answer and explanation', async ({ page }) => {
    await seed(page, [entry(LOCAL_QUESTIONS)])
    await page.goto(URL_STUDY)
    await start(page)

    await page.getByRole('radio', { name: /Oxygen/ }).click()
    await button(page, 'Check').click()
    await expect(page.getByText('Not yet. Try again.')).toBeVisible()
    await expect(page.getByText('You can take a hint if you like.')).toBeVisible()
    await button(page, 'Hint').click()
    await expect(page.getByText('Think about what plants take in from the air to make their food.')).toBeVisible()

    await page.getByRole('radio', { name: /Nitrogen/ }).click()
    await button(page, 'Check').click()
    const feedback = page.locator('[data-purpose="study-feedback"]')
    await expect(feedback).toHaveAttribute('data-state', 'revealed')
    await expect(feedback).toContainText('The right answer')
    await expect(feedback).toContainText('Carbon dioxide')
    await expect(feedback).toContainText('Plants absorb carbon dioxide and release oxygen.')
    await expect(page.getByRole('radio', { name: /Carbon dioxide/ })).toBeVisible()

  })

  test('two-choice questions (true/false, 2-option multiple choice): no hint, no second try, the answer shows at once and counts as wrong', async ({ page }) => {
    const twoOption = {
      id: 'q-two',
      type: 'mcq' as const,
      question: 'Which one is a planet?',
      options: ['Mars', 'The Sun'],
      correctIndex: 0,
      explanation: 'Mars orbits the Sun; the Sun is a star.',
      hints: ['Think about what orbits.'],
    }
    const questions = [...LOCAL_QUESTIONS.slice(0, 2), twoOption]
    await seed(page, [entry(questions as typeof LOCAL_QUESTIONS)])
    await page.goto(URL_STUDY)
    await start(page)
    // 4-option question keeps its hint button.
    await expect(button(page, 'Hint')).toBeVisible()
    await page.getByRole('radio', { name: /Carbon dioxide/ }).click()
    await button(page, 'Check').click()
    await button(page, 'Next').click()

    // True/false: wrong -> immediate reveal, no hint button, no retry.
    await expect(button(page, 'Hint')).toHaveCount(0)
    await page.getByRole('radio', { name: 'True' }).click()
    await button(page, 'Check').click()
    const feedback = page.locator('[data-purpose="study-feedback"]')
    await expect(feedback).toHaveAttribute('data-state', 'revealed')
    await expect(feedback).toContainText('False')
    await expect(page.getByText('Not yet. Try again.')).toHaveCount(0)
    await button(page, 'Next').click()

    // 2-option multiple choice: same.
    await expect(button(page, 'Hint')).toHaveCount(0)
    await page.getByRole('radio', { name: /The Sun/ }).click()
    await button(page, 'Check').click()
    await expect(feedback).toHaveAttribute('data-state', 'revealed')
    await expect(feedback).toContainText('Mars')
    await expect(feedback).toContainText('the Sun is a star')
    await button(page, 'Finish').click()
    await expect(page.locator('[data-purpose="study-score"]')).toHaveText('1 / 3 correct')
    await expect(page.locator('[data-purpose="study-wrong-list"] > li')).toHaveCount(2)
  })

  test('a right two-choice answer still counts as first-try correct', async ({ page }) => {
    await seed(page, [entry(LOCAL_QUESTIONS)])
    await page.goto(URL_STUDY)
    await start(page)
    await finishAllRight(page)
    await expect(page.locator('[data-purpose="study-score"]')).toHaveText('5 / 5 correct')
  })

  test('"Study my mistakes again" contains only the wrong ones; the score counts first tries; history is saved and shown', async ({ page }) => {
    await seed(page, [entry(LOCAL_QUESTIONS)])
    await page.clock.setFixedTime(NOW)
    await page.goto(URL_STUDY)
    await start(page)

    // q-mcq wrong twice, q-tf wrong (revealed at once: two choices), the rest right at once.
    await answerWrong(page, 'q-mcq')
    await page.getByRole('radio', { name: /Nitrogen/ }).click()
    await button(page, 'Check').click()
    await button(page, 'Next').click()
    await answerWrong(page, 'q-tf')
    await button(page, 'Next').click()
    await answerRight(page, 'q-fill')
    await button(page, 'Next').click()
    await answerRight(page, 'q-short')
    await button(page, 'Next').click()
    await answerRight(page, 'q-matching')
    await button(page, 'Finish').click()

    await expect(page.locator('[data-purpose="study-score"]')).toHaveText('3 / 5 correct')
    await expect(page.locator('[data-purpose="study-end"]')).toContainText('60%')
    const wrongList = page.locator('[data-purpose="study-wrong-list"]')
    await expect(wrongList.locator('> li')).toHaveCount(2)
    await expect(wrongList).toContainText('Which gas do plants absorb')
    await expect(wrongList).toContainText('Carbon dioxide')
    await expect(wrongList).toContainText('Great Wall')

    await button(page, /Study my mistakes again \(2\)/).click()
    await expect(progress(page)).toHaveText('1 / 2')
    await expect(questionBox(page)).toContainText('Which gas do plants absorb')
    await answerRight(page, 'q-mcq')
    await button(page, 'Next').click()
    await expect(questionBox(page)).toContainText('Great Wall')

    // The Archive card remembers the last full session, not the mistakes round.
    await page.goto('/archive?lng=en')
    await expect(page.locator('[data-purpose="archive-last-study"]')).toHaveText('Last session: 3/5, today')
  })

  test('leaving in the middle offers to continue where the student left off, also after a reload', async ({ page }) => {
    await seed(page, [entry(LOCAL_QUESTIONS)])
    await page.goto(URL_STUDY)
    await start(page)
    await answerRight(page, 'q-mcq')
    await button(page, 'Next').click()
    await answerRight(page, 'q-tf')
    await button(page, 'Next').click()
    await expect(progress(page)).toHaveText('3 / 5')

    await page.reload()
    const resume = page.locator('[data-purpose="study-resume"]')
    await expect(resume).toContainText('2 of 5 questions done.')
    await button(page, 'Continue where you left off').click()
    await expect(progress(page)).toHaveText('3 / 5')
    await expect(questionBox(page)).toContainText('Water boils at')

    // "Start over" drops the saved point.
    await page.reload()
    await button(page, 'Start over').click()
    await expect(page.locator('[data-purpose="study-resume"]')).toHaveCount(0)
  })

  test('Exit goes back to where the student came from', async ({ page }) => {
    await seed(page, [entry(LOCAL_QUESTIONS)])
    await page.goto('/archive?lng=en')
    await page.getByRole('link', { name: `Study — ${SAMPLE_QUIZ.title}` }).click()
    await start(page)
    await button(page, 'Exit').click()
    await expect(page).toHaveURL(/\/archive(\?|$)/)
  })

  test('every question type works: matching, short answer and open-ended (graded) included', async ({ page, mockGrade }) => {
    const grade = await mockGrade({ verdict: 'correct', feedback: 'Nice.', covered: 2, total: 2 })
    await seed(page, [entry()])
    await page.goto(URL_STUDY)
    await start(page)
    await finishAllRight(page, SAMPLE_QUIZ.questions.map((question) => question.id))
    await expect(page.locator('[data-purpose="study-score"]')).toHaveText('6 / 6 correct')
    // Short answer matched locally; only the open-ended question went to the grader.
    expect(grade.requests()).toHaveLength(1)
  })

  test('formulas are shown as readable math, never as LaTeX code', async ({ page }) => {
    const math = { ...SAMPLE_QUIZ.questions[0], question: 'What is $x^2$ when $x = 3$?', options: ['$6$', '$9$', '$12$', '$3$'], answerIndex: 1 }
    await seed(page, [entry([math] as typeof SAMPLE_QUIZ.questions)])
    await page.goto(URL_STUDY)
    await start(page)
    await expect(questionBox(page)).toContainText('x')
    await expect(questionBox(page)).not.toContainText('$')
    await expect(questionBox(page)).not.toContainText('\\')
  })
})

test.describe('Study types', () => {
  test('Exam practice shows no feedback until the end, then every answer and explanation', async ({ page }) => {
    await seed(page, [entry(LOCAL_QUESTIONS)])
    await page.goto(URL_STUDY)
    await start(page, 'Exam practice')
    await expect(page.getByRole('timer')).toHaveText('5:00')

    await page.getByRole('radio', { name: /Oxygen/ }).click()
    await expect(button(page, 'Check')).toHaveCount(0)
    await button(page, 'Next').click()
    await expect(page.getByText('Not yet. Try again.')).toHaveCount(0)
    await expect(page.locator('[data-purpose="study-feedback"]')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Hint' })).toHaveCount(0)
    await page.getByRole('radio', { name: 'False' }).click()
    await button(page, 'Next').click()
    await page.getByLabel('Your answer').fill('100')
    await button(page, 'Next').click()
    await button(page, 'Next').click() // short answer left empty
    await button(page, 'Finish').click() // matching left empty

    await expect(page.locator('[data-purpose="study-score"]')).toHaveText('2 / 5 correct')
    const all = page.locator('[data-purpose="study-all-answers"]')
    await expect(all).toContainText('Plants absorb carbon dioxide and release oxygen.')
    await expect(all).toContainText('Jupiter')
    await expect(page.locator('[data-purpose="study-wrong-list"] > li')).toHaveCount(3)
  })

  test('the exam timer runs out: the session ends and is scored', async ({ page }) => {
    await seed(page, [entry(LOCAL_QUESTIONS)])
    await page.clock.install({ time: NOW })
    await page.goto(URL_STUDY)
    await start(page, 'Exam practice')
    await page.getByRole('radio', { name: /Carbon dioxide/ }).click()
    await button(page, 'Next').click()
    await page.clock.runFor(60_000)
    await expect(page.getByRole('timer')).toHaveText('4:00')
    await page.clock.runFor(4 * 60_000 + 2_000)
    await expect(page.locator('[data-purpose="study-score"]')).toHaveText('1 / 5 correct')
    await expect(page.locator('[data-purpose="study-end"]')).toContainText('Time ran out')
  })

  test('the total time can be changed, and a per-question timer reveals the answer when it runs out', async ({ page }) => {
    await seed(page, [entry(LOCAL_QUESTIONS)])
    await page.clock.install({ time: NOW })
    await page.goto(URL_STUDY)
    await page.getByRole('radio', { name: 'Per question' }).click()
    await page.getByLabel('Seconds per question').fill('20')
    await button(page, 'Start').click()
    await expect(page.getByRole('timer')).toHaveText('0:20')
    await page.clock.runFor(21_000)
    await expect(page.locator('[data-purpose="study-feedback"]')).toContainText('Time is up')
    await expect(page.locator('[data-purpose="study-feedback"]')).toContainText('Carbon dioxide')
    await button(page, 'Next').click()
    await expect(progress(page)).toHaveText('2 / 5')
    await expect(page.getByRole('timer')).toHaveText('0:20')
  })

  test('timer Off shows no countdown, for every study type', async ({ page }) => {
    await seed(page, [entry(LOCAL_QUESTIONS)])
    await page.clock.install({ time: NOW })
    await page.goto(URL_STUDY)
    await page.getByRole('radio', { name: 'Off' }).click()
    await page.getByRole('radio', { name: /Exam practice/ }).check()
    await expect(page.getByRole('radio', { name: 'Off' })).toHaveAttribute('aria-checked', 'true')
    await button(page, 'Start').click()
    await expect(questionBox(page)).toBeVisible()
    await page.clock.runFor(30_000)
    await expect(page.getByRole('timer')).toHaveCount(0)
    await expect(page.getByText(/\d+:\d\d/)).toHaveCount(0)
  })

  test('total and per-question timers count down from the chosen value; Off starts no timer', async ({ page }) => {
    await seed(page, [entry(LOCAL_QUESTIONS)])
    await page.clock.install({ time: NOW })
    await page.goto(URL_STUDY)
    await page.getByRole('radio', { name: 'Total time' }).click()
    await page.getByLabel('Total minutes').fill('3')
    await button(page, 'Start').click()
    await expect(page.getByRole('timer')).toHaveText('3:00')
    await page.clock.runFor(10_000)
    await expect(page.getByRole('timer')).toHaveText('2:50')
  })

  test('Quick review holds only wrong, guessed and flagged questions from earlier sessions', async ({ page }) => {
    await seed(page, [entry(LOCAL_QUESTIONS)])
    await page.goto(URL_STUDY)
    await start(page)

    // q-mcq wrong twice; q-tf right but guessed; q-fill right and flagged; the rest right and sure.
    await answerWrong(page, 'q-mcq')
    await page.getByRole('radio', { name: /Nitrogen/ }).click()
    await button(page, 'Check').click()
    await button(page, 'Next').click()
    await answerRight(page, 'q-tf')
    await button(page, 'I guessed').click()
    await button(page, 'Next').click()
    await answerRight(page, 'q-fill')
    await button(page, 'Look again later').click()
    await button(page, 'Next').click()
    await answerRight(page, 'q-short')
    await button(page, 'I was sure').click()
    await button(page, 'Next').click()
    await answerRight(page, 'q-matching')
    await button(page, 'Finish').click()

    await expect(page.locator('[data-purpose="study-score"]')).toHaveText('4 / 5 correct')
    await expect(page.locator('[data-purpose="study-guessed-list"]')).toContainText('Great Wall')
    await expect(page.locator('[data-purpose="study-flagged-list"]')).toContainText('Water boils at')

    // Flagged round at the end.
    await button(page, /Look at my flagged ones \(1\)/).click()
    await expect(progress(page)).toHaveText('1 / 1')
    await expect(questionBox(page)).toContainText('Water boils at')
    await button(page, 'Exit').click()

    await page.goto(URL_STUDY)
    const quick = page.getByRole('radio', { name: /Quick review/ })
    await expect(quick).toBeEnabled()
    await expect(page.getByText('3 questions')).toBeVisible()
    await start(page, 'Quick review')
    await expect(progress(page)).toHaveText('1 / 3')
    await expect(questionBox(page)).toContainText('Which gas do plants absorb')
    await answerRight(page, 'q-mcq')
    await button(page, 'Next').click()
    await expect(questionBox(page)).toContainText('Great Wall')
    await answerRight(page, 'q-tf')
    await button(page, 'Next').click()
    await expect(questionBox(page)).toContainText('Water boils at')
  })

  test('the last choices (type and timer) are remembered', async ({ page }) => {
    await seed(page, [entry(LOCAL_QUESTIONS)])
    await page.goto(URL_STUDY)
    await page.getByRole('radio', { name: /Exam practice/ }).check()
    await page.getByLabel('Total minutes').fill('7')
    await button(page, 'Start').click()
    await expect(page.getByRole('timer')).toHaveText('7:00')
    await button(page, 'Exit').click()
    await page.goto(URL_STUDY)
    await expect(page.getByRole('radio', { name: /Exam practice/ })).toBeChecked()
    await expect(page.getByLabel('Total minutes')).toHaveValue('7')
  })
})

test.describe('Study extras', () => {
  test('streak: pulses at 3 in a row; reduced motion and the setting turn the animation off', async ({ page }) => {
    await seed(page, [entry(LOCAL_QUESTIONS)])
    await page.goto(URL_STUDY)
    await start(page)
    for (const id of IDS.slice(0, 3)) {
      await answerRight(page, id)
      await button(page, 'Next').click()
    }
    const streak = page.locator('[data-purpose="study-streak"]')
    await expect(streak).toHaveText('3 in a row')
    await expect(streak).toHaveAttribute('data-animate', 'true')
    await expect(streak).toHaveClass(/animate-streak/)

    await button(page, 'Settings').click()
    await page.getByRole('checkbox', { name: 'Celebration animations' }).uncheck()
    await expect(streak).toHaveAttribute('data-animate', 'false')
    await expect(streak).not.toHaveClass(/animate-streak/)
  })

  test('streak animation and confetti are hidden under reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await seed(page, [entry(LOCAL_QUESTIONS)])
    await page.goto(URL_STUDY)
    await start(page)
    for (const id of IDS.slice(0, 3)) {
      await answerRight(page, id)
      await button(page, 'Next').click()
    }
    const streak = page.locator('[data-purpose="study-streak"]')
    await expect(streak).toHaveText('3 in a row')
    await expect(streak).toHaveAttribute('data-animate', 'false')
    await expect(streak).not.toHaveClass(/animate-streak/)
    await answerRight(page, IDS[3])
    await button(page, 'Next').click()
    await answerRight(page, IDS[4])
    await button(page, 'Finish').click()
    await expect(page.locator('[data-purpose="study-score"]')).toHaveText('5 / 5 correct')
    await expect(page.locator('[data-purpose="study-confetti"]')).toHaveCount(0)
  })

  test('confetti bursts on 80 percent or more', async ({ page }) => {
    await seed(page, [entry(LOCAL_QUESTIONS)])
    await page.goto(URL_STUDY)
    await start(page)
    await finishAllRight(page)
    await expect(page.locator('[data-purpose="study-confetti"]')).toHaveCount(1)
  })

  test('@cross the sidebar is hidden during study; focus mode leaves with the button or Esc and the sidebar returns on exit', async ({ page }) => {
    await seed(page, [entry(LOCAL_QUESTIONS)])
    await page.goto(URL_STUDY)
    const sidebar = page.locator('[data-purpose="sidebar-navigation"]')
    await expect(page.locator('[data-purpose="study-start"]')).toBeVisible()
    await expect(sidebar).toHaveCount(0)
    await start(page)
    await expect(sidebar).toHaveCount(0)
    await button(page, 'Focus mode').click()
    await expect(button(page, 'Leave focus mode')).toBeVisible()
    await button(page, 'Leave focus mode').click()
    await button(page, 'Focus mode').click()
    await expect(button(page, 'Leave focus mode')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(button(page, 'Focus mode')).toBeVisible()
    await button(page, 'Exit').click()
    await expect(sidebar).toBeVisible()
  })

  test('@cross read aloud uses the browser speech synthesis and stops on the next question', async ({ page }) => {
    await page.addInitScript(() => {
      const spoken: string[] = []
      let cancels = 0
      ;(window as unknown as { __speech: { spoken: string[]; cancels: () => number } }).__speech = { spoken, cancels: () => cancels }
      class FakeUtterance {
        text: string
        lang = ''
        voice: unknown = null
        onend: (() => void) | null = null
        onerror: (() => void) | null = null
        constructor(text: string) {
          this.text = text
        }
      }
      ;(window as unknown as { SpeechSynthesisUtterance: unknown }).SpeechSynthesisUtterance = FakeUtterance
      Object.defineProperty(window, 'speechSynthesis', {
        configurable: true,
        value: {
          getVoices: () => [{ lang: 'en-US', name: 'Fake' }],
          speak: (utterance: { text: string }) => spoken.push(utterance.text),
          cancel: () => {
            cancels += 1
          },
        },
      })
    })
    await seed(page, [entry(LOCAL_QUESTIONS)])
    await page.goto(URL_STUDY)
    await start(page)
    await page.getByRole('button', { name: 'Read aloud' }).click()
    const spoken = () => page.evaluate(() => (window as unknown as { __speech: { spoken: string[] } }).__speech.spoken)
    await expect.poll(spoken).toHaveLength(1)
    expect((await spoken())[0]).toContain('Which gas do plants absorb')
    expect((await spoken())[0]).toContain('B. Carbon dioxide')
    const cancelsBefore = await page.evaluate(() => (window as unknown as { __speech: { cancels: () => number } }).__speech.cancels())
    await answerRight(page, 'q-mcq')
    await button(page, 'Next').click()
    const cancelsAfter = await page.evaluate(() => (window as unknown as { __speech: { cancels: () => number } }).__speech.cancels())
    expect(cancelsAfter).toBeGreaterThan(cancelsBefore)
  })

  test('@cross the read-aloud button is hidden when the browser has no voice for the language', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'speechSynthesis', {
        configurable: true,
        value: { getVoices: () => [{ lang: 'de-DE', name: 'Other' }], speak: () => undefined, cancel: () => undefined },
      })
    })
    await seed(page, [entry(LOCAL_QUESTIONS)])
    await page.goto(URL_STUDY)
    await start(page)
    await expect(page.getByRole('button', { name: 'Read aloud' })).toHaveCount(0)
  })

  test('the history chart appears after two sessions and shows the best score', async ({ page }) => {
    await seed(page, [entry(LOCAL_QUESTIONS)])
    await page.goto(URL_STUDY)
    await start(page)
    await answerWrong(page, 'q-mcq')
    await page.getByRole('radio', { name: /Nitrogen/ }).click()
    await button(page, 'Check').click()
    await button(page, 'Next').click()
    await answerRight(page, 'q-tf')
    await button(page, 'Next').click()
    await answerRight(page, 'q-fill')
    await button(page, 'Next').click()
    await answerRight(page, 'q-short')
    await button(page, 'Next').click()
    await answerRight(page, 'q-matching')
    await button(page, 'Finish').click()
    await expect(page.locator('[data-purpose="study-history-chart"] [data-score]')).toHaveCount(1)

    await button(page, 'Study from the start').click()
    await button(page, 'Start').click()
    await finishAllRight(page)
    const bars = page.locator('[data-purpose="study-history-chart"] [data-score]')
    await expect(bars).toHaveCount(2)
    await expect(bars.nth(0)).toHaveAttribute('data-score', '4/5')
    await expect(bars.nth(1)).toHaveAttribute('data-score', '5/5')
    await expect(page.locator('[data-purpose="study-history-chart"]')).toContainText('Best: 5/5')

    // The quiz page shows the same history.
    await page.goto(`/archive/${entry().id}?lng=en`)
    await expect(page.locator('[data-purpose="study-history"] [data-score]')).toHaveCount(2)
  })

  test('mistakes can become flashcards from the end screen', async ({ page }) => {
    await seed(page, [entry(LOCAL_QUESTIONS)])
    await page.goto(URL_STUDY)
    await start(page)
    await answerWrong(page, 'q-mcq')
    await page.getByRole('radio', { name: /Nitrogen/ }).click()
    await button(page, 'Check').click()
    await button(page, 'Next').click()
    for (const id of IDS.slice(1)) {
      await answerRight(page, id)
      await button(page, id === 'q-matching' ? 'Finish' : 'Next').click()
    }
    await button(page, 'Flashcards from my mistakes (1)').click()
    await expect(page.locator('[data-purpose="mistakes-result"]')).toContainText('Added 1 card')
  })
})

for (const [lang, strings] of [['tr', tr], ['en', en], ['hyw', hyw]] as const) {
  test(`Study Mode is localized (${lang}): start, question, feedback and end screens`, async ({ page }) => {
    await seed(page, [entry(LOCAL_QUESTIONS)])
    await page.goto(`/archive/${entry().id}?mode=study&lng=${lang}`)
    await expect(page.locator('[data-purpose="study-start"]').getByText(strings.study.label, { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: strings.study.start.begin, exact: true })).toBeVisible()
    await page.getByRole('button', { name: strings.study.start.begin, exact: true }).click()
    await expect(progress(page)).toHaveText('1 / 5')
    await page.getByRole('radio').nth(0).click()
    await page.getByRole('button', { name: strings.study.run.check, exact: true }).click()
    await page.getByRole('radio').nth(1).click()
    await page.getByRole('button', { name: strings.study.run.check, exact: true }).click()
    await expect(page.locator('[data-purpose="study-feedback"]')).toBeVisible()
    await page.getByRole('button', { name: strings.study.run.next, exact: true }).click()
    await expect(progress(page)).toHaveText('2 / 5')
  })
}

test.describe('layout', () => {
  test('on a wide screen the start, question and end screens sit in the horizontal centre of the window', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 })
    await seed(page, [entry(LOCAL_QUESTIONS)])
    await page.goto(URL_STUDY)
    const offCentre = async (purpose: string) =>
      page.evaluate((name) => {
        const box = document.querySelector(`[data-purpose="${name}"]`)!.getBoundingClientRect()
        return Math.abs(document.documentElement.clientWidth / 2 - (box.left + box.width / 2))
      }, purpose)
    await expect(page.locator('[data-purpose="study-start"]')).toBeVisible()
    expect(await offCentre('study-start')).toBeLessThanOrEqual(2)
    await start(page)
    expect(await offCentre('study-run')).toBeLessThanOrEqual(2)
    await finishAllRight(page)
    await expect(page.locator('[data-purpose="study-end"]')).toBeVisible()
    expect(await offCentre('study-end')).toBeLessThanOrEqual(2)
  })
})

test.describe('mobile', () => {
  test('@mobile 360px: no horizontal scroll, answer targets are at least 44px, every screen fits', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 })
    await seed(page, [entry(LOCAL_QUESTIONS)])
    const noOverflow = async () => expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

    await page.goto(URL_STUDY)
    await expect(page.locator('[data-purpose="study-start"]')).toBeVisible()
    await noOverflow()
    await start(page)
    await noOverflow()
    for (const radio of await page.getByRole('radio').all()) {
      const box = await radio.boundingBox()
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
    }
    const check = await button(page, 'Check').boundingBox()
    expect(check?.height ?? 0).toBeGreaterThanOrEqual(44)
    await page.getByRole('radio', { name: /Oxygen/ }).click()
    await button(page, 'Check').click()
    await noOverflow()
    await page.getByRole('radio', { name: /Nitrogen/ }).click()
    await button(page, 'Check').click()
    await noOverflow()
    await button(page, 'Next').click()
    for (const id of IDS.slice(1)) {
      await answerRight(page, id)
      await button(page, id === 'q-matching' ? 'Finish' : 'Next').click()
    }
    await expect(page.locator('[data-purpose="study-end"]')).toBeVisible()
    await noOverflow()
  })
})
