import { describe, expect, it } from 'vitest'
import { checkText, foldAccents, normalize } from './check'

describe('normalize', () => {
  it('lowercases, trims, collapses whitespace and drops punctuation', () => {
    expect(normalize('  Hola,   ¿Cómo   estás?  ')).toBe('hola cómo estás')
  })
  it('keeps accents intact', () => {
    expect(normalize('CAFÉ')).toBe('café')
  })
})

describe('foldAccents', () => {
  it('folds vowel accents but preserves ñ', () => {
    expect(foldAccents('cómo estás')).toBe('como estas')
    expect(foldAccents('español')).toBe('español')
    expect(foldAccents('año')).toBe('año')
  })
})

describe('checkText', () => {
  it('accepts an exact (normalized) match', () => {
    expect(checkText('Buenas tardes', ['buenas tardes'])).toEqual({ correct: true })
  })
  it('accepts a missing-accent answer but adds a note', () => {
    const r = checkText('como estas', ['cómo estás'])
    expect(r.correct).toBe(true)
    expect(r.note).toContain('cómo estás')
  })
  it('rejects a wrong answer', () => {
    expect(checkText('hola', ['adiós']).correct).toBe(false)
  })
  it('rejects an empty answer', () => {
    expect(checkText('   ', ['hola']).correct).toBe(false)
  })
  it('does not treat ñ and n as interchangeable when an exact match exists', () => {
    // "ano" != "año"; only the lenient path could match, and here it should
    // still flag the accent-fold difference rather than silently pass as exact.
    expect(checkText('año', ['año'])).toEqual({ correct: true })
  })
})
