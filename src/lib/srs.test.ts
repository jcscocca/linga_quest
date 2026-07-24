import { describe, expect, it } from 'vitest'
import { EARNED_INTERVAL, LAPSE_DROP, MAX_LEVEL, newState, schedule, testModeForLevel, type ItemState } from './srs'

const at = (level: number, over: Partial<ItemState> = {}): ItemState => ({
  level, interval: EARNED_INTERVAL[level], due: '2026-07-24', lapses: 0, seen: '2026-07-24', origin: 'default', ...over,
})

describe('testModeForLevel', () => {
  it('escalates choice → type → audio with maturity', () => {
    expect(testModeForLevel(0)).toBe('choice')
    expect(testModeForLevel(2)).toBe('choice')
    expect(testModeForLevel(3)).toBe('type')
    expect(testModeForLevel(4)).toBe('type')
    expect(testModeForLevel(5)).toBe('audio')
  })
})

describe('newState', () => {
  it('is an unseen level-0 word due today', () => {
    const s = newState('2026-07-24')
    expect(s).toEqual({ level: 0, interval: 0, due: '2026-07-24', lapses: 0, seen: '2026-07-24', origin: 'default' })
  })
})

describe('schedule', () => {
  it('on right: raises level by one and pushes due out by the earned interval', () => {
    const s = schedule(at(2), 'right', '2026-07-24')
    expect(s.level).toBe(3)
    expect(s.interval).toBe(EARNED_INTERVAL[3])
    expect(s.due).toBe('2026-08-01') // +8 days
    expect(s.seen).toBe('2026-07-24')
  })

  it('caps level at MAX_LEVEL on repeated success', () => {
    const s = schedule(at(MAX_LEVEL), 'right', '2026-07-24')
    expect(s.level).toBe(MAX_LEVEL)
    expect(s.interval).toBe(EARNED_INTERVAL[MAX_LEVEL])
  })

  it('on wrong: drops LAPSE_DROP levels, resets interval, counts a lapse', () => {
    const s = schedule(at(5, { lapses: 1 }), 'wrong', '2026-07-24')
    expect(s.level).toBe(5 - LAPSE_DROP)
    expect(s.interval).toBe(EARNED_INTERVAL[5 - LAPSE_DROP])
    expect(s.lapses).toBe(2)
  })

  it('floors level at 0 on a wrong answer from a low level', () => {
    const s = schedule(at(1), 'wrong', '2026-07-24')
    expect(s.level).toBe(0)
    expect(s.due).toBe('2026-07-24') // interval 0 → due today
  })
})
