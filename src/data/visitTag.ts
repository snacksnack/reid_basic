// RC1-688: the visit's ?src= tag (hihelloreid.com/?src=<company>). Captured
// from any page load that carries it and kept in sessionStorage so it
// survives same-tab navigation (plain <a> links drop the query string), then
// appended to resume download links so the download row itself names the
// application that produced it.
const KEY = 'visit-src'

export function captureVisitTag(): string | null {
  let tag: string | null = null
  try {
    tag = new URLSearchParams(window.location.search).get('src')
    if (tag) {
      sessionStorage.setItem(KEY, tag)
    } else {
      tag = sessionStorage.getItem(KEY)
    }
  } catch {
    // Storage unavailable (private mode, blocked site data): the landing
    // page's URL param alone still tags that first view.
  }
  return tag
}

export function downloadHref(fmt: 'pdf' | 'docx'): string {
  const tag = captureVisitTag()
  return tag
    ? `/api/download/${fmt}?src=${encodeURIComponent(tag)}`
    : `/api/download/${fmt}`
}
