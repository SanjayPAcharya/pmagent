import { describe, it, expect } from 'vitest'
import { toCsv, parseCsv } from './csv'

describe('toCsv / parseCsv', () => {
  it('round-trips plain cells', () => {
    const rows = [
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]
    expect(parseCsv(toCsv(rows))).toEqual(rows)
  })

  it('round-trips quotes, commas, and newlines inside cells', () => {
    const rows = [
      ['title', 'notes'],
      ['Says "hi", loudly', 'line one\nline two'],
      ['comma, cell', 'quote " cell'],
    ]
    expect(parseCsv(toCsv(rows))).toEqual(rows)
  })

  it('quotes only cells that need it', () => {
    expect(toCsv([['plain', 'a,b', 'q"q']])).toBe('plain,"a,b","q""q"')
  })

  it('parses CRLF and lone-LF line endings alike', () => {
    expect(parseCsv('a,b\r\nc,d')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ])
    expect(parseCsv('a,b\nc,d')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ])
  })

  it('drops fully-empty trailing rows', () => {
    expect(parseCsv('a,b\n,\n\n')).toEqual([['a', 'b']])
  })

  it('keeps empty cells within a non-empty row', () => {
    expect(parseCsv('a,,c')).toEqual([['a', '', 'c']])
  })
})
