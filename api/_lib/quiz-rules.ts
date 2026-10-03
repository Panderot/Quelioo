import type { QuizQuestionType } from '../../src/lib/quiz.js'
import type { QuestionType } from '../../src/lib/quizTypes.js'

/** Quality rules shared by quiz generation, regenerate-one and the review call — one wording, so the
 * writer and the checker hold every question to the same bar. */

export const GENERAL_QUALITY_RULES = [
  'QUALITY RULES (apply to every question, every type, every language):',
  '1) Every stem is self-contained, unambiguous, grammatical and free of spelling mistakes. It must make sense printed without the source — never "according to the text" unless the question really is about the text.',
  '2) Exactly one defensible answer per question.',
  '3) NO LEAKAGE: a question must never contain the answer (or any form of it) of ANY OTHER question in the quiz. Word different questions differently; where the topic name would reveal another answer, refer to it with a self-contained description (e.g. "the process by which green plants make food") — never with "this process", "it" or other words that need the source or another question to understand. Never make the topic\'s own name the answer when it appears in other questions.',
  '4) NO HIDDEN REPEATS: every question tests a different fact; no two questions have the same answer; no near-duplicate stems. In a mixed quiz a fact appears in only ONE question across all types.',
  '5) Cover the whole source evenly (the end as much as the beginning). With only 1-3 questions, use the core concepts of the text, not simply its first sentences.',
  '6) Never pad: if <source_text> has fewer distinct, important facts than the requested count, write fewer good questions and set "supportedCount" to the number of good questions the text supports. Never write trivial or repeated questions to reach the count.',
].join(' ')

const TYPE_RULES: Record<QuizQuestionType, string> = {
  mcq: 'MCQ RULES: exactly the requested number of options; one unambiguously correct option; distractors come from real misconceptions or close concepts in the source (e.g. the function of a neighbouring structure, a related but different result) — never invented, absurd or self-contradicting statements — are clearly wrong to someone who knows the material, and stay plausible to someone who does not; the correct option never repeats the key words of the stem (with 2 options the wrong one is a real alternative; with 5 every option is distinct and plausible); no option contains or repeats another; options are parallel in grammar and similar in length — the correct option must not be the longest or most detailed one by habit; no grammatical clue in the stem (a suffix, article or number) that fits only one option; no "all/none of the above"; negative stems ("which is NOT") only on medium and hard; vary the correct position.',
  'true-false':
    'TRUE/FALSE RULES: about half the statements are true and half false (with 4+ statements 40-60 % true; with 2-3, include both values); statements are self-contained and not trivially decided by wording; a false statement is a realistic misconception made by changing ONE key fact — never a plain negation with "not", never a mirror image of another statement; avoid absolute words (always/never/only) unless the claim really is absolute; with explanations on, a false statement\'s explanation says exactly what is wrong.',
  'fill-blanks':
    'FILL-IN-THE-BLANK RULES: never copy a source sentence and delete a word — write a new sentence in your own words that has exactly ONE blank written as "___" and exactly ONE best answer. The blank is on a key concept (a specific term, structure, substance, name or number) — never a category word ("organelle", "pigment" when a specific one is meant), never a filler or function word, never a verb of vague degree (slows/decreases/stops/drops), never the topic\'s own name. Put the blank where the base (dictionary) form fits with no suffix (e.g. "... ___ olarak adlandırılır", "... is called ___"); only blank an inflected word when no base-form wording exists. Do not repeat a word next to the blank ("pigment ___ pigmentidir"). Vary the blank position across questions. "answer" is the base form. "acceptableAnswers" (required, up to 8): the base form, plus only those inflected forms (Turkish: case, plural, possessive) and true synonyms that are grammatical in THIS exact blank — never a form that does not fit the sentence (forms differing only in diacritics or capitals are handled by the checker, do not list them); if two answers are equally valid and unavoidable, list both.',
  'short-answer':
    'SHORT-ANSWER RULES: one clear question with a short expected answer (a few words or one or two sentences) that asks to explain, compare or apply, not to recall a copied phrase; never answerable with yes or no; "answer" is the expected answer and "acceptableAnswers" lists other correct phrasings; different questions draw on different parts of the source.',
  matching:
    'MATCHING RULES: 4 to 6 pairs; every left item matches exactly one right item and the reverse (no synonyms or overlapping meanings across pairs, no ambiguous mapping); a left item and its own right item share no word that gives the match away; items are short; each pair covers a different fact; the right-hand values do not follow a mirrored or alphabetical order.',
  'open-ended':
    'OPEN-ENDED RULES: ask the student to explain, compare, evaluate or apply; "keyPoints" has 3 to 5 specific, checkable points backed by the source (no point requires facts that are not in the source); keyPoints never overlap with another question\'s keyPoints.',
}

export function typeRules(questionType: QuestionType): string {
  if (questionType === 'mixed') {
    return [
      'MIXED: use the requested type for each slot (or a balanced mix of mcq, true-false, fill-blanks, short-answer, matching and open-ended when no plan is given); each question follows the rules of its own type below; the difficulty applies to all of them.',
      ...Object.values(TYPE_RULES),
    ].join(' ')
  }
  return TYPE_RULES[questionType]
}

export function typeRulesFor(types: Iterable<QuizQuestionType>): string {
  return [...new Set(types)].map((type) => TYPE_RULES[type]).join(' ')
}
