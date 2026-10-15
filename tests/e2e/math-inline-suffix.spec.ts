import { test, expect } from '@playwright/test'
import { splitMathSegments } from '../../src/lib/mathSegments'

test.describe('splitMathSegments: suffix and punctuation stay with inline math', () => {
  const cases: [string, unknown][] = [
    [
      'En küçük değer $(2, 0)$\'dır.',
      [
        { type: 'text', value: 'En küçük değer ' },
        { type: 'math', value: '(2, 0)', block: false, trailing: '\'dır.' },
      ],
    ],
    [
      '$x$, $y$',
      [
        { type: 'math', value: 'x', block: false, trailing: ',' },
        { type: 'text', value: ' ' },
        { type: 'math', value: 'y', block: false },
      ],
    ],
    [
      '$x$ değeri',
      [
        { type: 'math', value: 'x', block: false },
        { type: 'text', value: ' değeri' },
      ],
    ],
    ['Fiyat $5 ve', [{ type: 'text', value: 'Fiyat $5 ve' }]],
    [
      '$a$’tür',
      [{ type: 'math', value: 'a', block: false, trailing: '’tür' }],
    ],
    [
      '$$x^2$$.',
      [
        { type: 'math', value: 'x^2', block: true },
        { type: 'text', value: '.' },
      ],
    ],
  ]
  for (const [input, expected] of cases) {
    test(JSON.stringify(input), () => {
      expect(splitMathSegments(input)).toEqual(expected)
    })
  }
})
