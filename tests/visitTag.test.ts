// RC1-688: the visit's ?src= tag rides on download links.
import { describe, it, expect, beforeEach } from 'vitest'
import { captureVisitTag, downloadHref } from '../src/data/visitTag'

describe('visitTag', () => {
  beforeEach(() => {
    sessionStorage.clear()
    window.history.replaceState({}, '', '/')
  })

  it('appends the URL tag to download links', () => {
    window.history.replaceState({}, '', '/?src=figma')
    expect(downloadHref('pdf')).toBe('/api/download/pdf?src=figma')
  })

  it('keeps the tag across navigation that drops the query string', () => {
    window.history.replaceState({}, '', '/?src=figma')
    captureVisitTag()
    window.history.replaceState({}, '', '/work')
    expect(downloadHref('docx')).toBe('/api/download/docx?src=figma')
  })

  it('leaves untagged visits with plain links', () => {
    expect(downloadHref('pdf')).toBe('/api/download/pdf')
  })

  it('encodes tag values that need it', () => {
    window.history.replaceState({}, '', '/?src=a+b')
    expect(downloadHref('pdf')).toBe('/api/download/pdf?src=a%20b')
  })
})
