// Content for the Concert Intelligence Agent card (RC1-226).
// Source: github.com/snacksnack/n8n-concert-intelligence-agent.
//
// The weights below are read out of the workflow's own "Score Concerts" node
// (recency 30 / frequency 25 / distance 20 / price 15 / venue 10) and the
// calendar gate out of "Calendar Prep" (CAL_THRESHOLD = 60), not the README.

import type { ProjectCardContent } from './projectCard'

export interface ScoreDimension {
  label: string
  points: number
  max: number
  detail: string // how this row was earned
}

export interface ScoredShow {
  artist: string
  venue: string
  when: string
  total: number
  max: number
}

export const concertIntelligence = {
  name: 'Concert Intelligence Agent',
  kicker: 'Personal automation',
  lead: 'Ranks upcoming shows by what you actually listen to.',
  tagline:
    'An n8n workflow that reads a Spotify listening history every morning, sweeps Ticketmaster for the next six months within fifty miles, matches events to artists on normalized names, and scores each show out of 100. What clears the bar becomes an email digest, a calendar event and a Notion row — each carrying a Claude-written preview of what the band has been playing live.',
  note: 'Ticketmaster refuses to page past 1,000 results, so the search is split into month-sized windows and matched page by page inside the loop — the workflow never holds thousands of raw events in one node.',
  evals: {
    blurb: 'Prompt-contract and golden evals on the Claude-written concert preview.',
    href: 'https://snacksnack.github.io/agent-evals/',
  },

  technologies: [
    'n8n',
    'Spotify API',
    'Ticketmaster API',
    'setlist.fm',
    'Claude API',
    'Google Calendar',
    'Notion',
    'Gmail',
    'agent-evals',
  ],

  links: [
    {
      label: 'GitHub ↗',
      href: 'https://github.com/snacksnack/n8n-concert-intelligence-agent',
    },
  ],

  // One scored match, broken out the way the workflow stores it on the event.
  show: {
    artist: 'A top-10 short-term artist',
    venue: "Baby's All Right",
    when: 'in three weeks',
    total: 85,
    max: 100,
  } as ScoredShow,

  dimensions: [
    { label: 'Recency', points: 30, max: 30, detail: 'Played today — full marks; the score decays by band to 0 past 90 days.' },
    { label: 'Frequency', points: 20, max: 25, detail: 'Recent plays at 2 pts each, plus rank bonuses across all three Spotify windows.' },
    { label: 'Distance', points: 15, max: 20, detail: 'Inside 15 miles of home.' },
    { label: 'Price', points: 10, max: 15, detail: 'Minimum ticket under $100.' },
    { label: 'Venue fit', points: 10, max: 10, detail: 'A ~250-cap room — the top tier of a personal venue list.' },
  ] as ScoreDimension[],

  scoreCaption:
    'Deterministic arithmetic decides the ranking; Claude only writes the setlist preview. Anything at 60 or above also books itself onto the calendar.',
} as const satisfies ProjectCardContent & {
  show: ScoredShow
  dimensions: ScoreDimension[]
  scoreCaption: string
}
