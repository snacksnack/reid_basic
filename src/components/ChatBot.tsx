import { useState, useRef, useEffect, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import FitCard, { type FitCardData } from './FitCard'
import './ChatBot.css'

interface Message {
  role: 'user' | 'assistant'
  content: string
  fitCard?: FitCardData
  isMatch?: boolean
}

const GREETING =
  "Hi — I'm Reid's AI assistant. Ask me anything about his experience, or paste a job description to see how he fits the role."

// Internal command that triggers the structured fit card. Prepended invisibly
// when the user is in role-fit mode — never shown in the input or their bubble.
const MATCH_PREFIX = '/match '
const MATCH_PLACEHOLDER = 'Paste the job description here, then press send…'

// Starter chips shown in the empty state (discoverability — recruiters can't
// find a hidden slash command). The match chip enters role-fit mode; the rest
// send immediately.
const PROMPT_CHIPS: Array<{ label: string; value?: string; match?: boolean }> = [
  { label: 'See how he fits your role', match: true },
  { label: 'Is he senior enough?', value: 'Is Reid senior enough for a lead role?' },
  { label: "What's his AWS experience?", value: 'What is Reid’s AWS experience?' },
]

const MAX_USER_MESSAGES = 10

const LIMIT_MESSAGE =
  "Okay, you're clearly very thorough — I respect that. But you've burned through enough OpenAI tokens to buy Reid a coffee, so I'm cutting you off. For anything else, reach out to him directly at hire.reid.collins@gmail.com."

function generateSessionId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export default function ChatBot() {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: GREETING },
  ])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [matchMode, setMatchMode] = useState(false)
  const sessionId = useMemo(generateSessionId, [])

  const userMessageCount = messages.filter((m) => m.role === 'user').length
  const isLimitReached = userMessageCount >= MAX_USER_MESSAGES
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen])

  useEffect(() => {
    if (!isLoading && isOpen) {
      inputRef.current?.focus()
    }
  }, [isLoading, isOpen])

  // The resume-page CTA opens the panel and enters role-fit mode — the recruiter
  // just pastes a job description. Decoupled via a window event so the CTA needs
  // no shared state with this component.
  useEffect(() => {
    const openForMatch = () => {
      setIsOpen(true)
      setMatchMode(true)
      setTimeout(() => inputRef.current?.focus(), 120)
    }
    window.addEventListener('open-role-fit', openForMatch)
    return () => window.removeEventListener('open-role-fit', openForMatch)
  }, [])

  const sendMessage = async (override?: string) => {
    const text = (override ?? input).trim()
    if (!text || isLoading || isLimitReached) return

    // In role-fit mode the user pastes a raw job description; prepend the /match
    // command for the API but keep it out of what the user sees in their bubble.
    const isMatch = matchMode && override === undefined
    const apiText =
      isMatch && !text.toLowerCase().startsWith(MATCH_PREFIX.trim())
        ? `${MATCH_PREFIX}${text}`
        : text

    const userMessage: Message = { role: 'user', content: text, isMatch }
    const updated = [...messages, userMessage]
    setMessages(updated)
    setInput('')
    setMatchMode(false)
    if (inputRef.current) inputRef.current.style.height = 'auto'

    const newUserCount = userMessageCount + 1
    if (newUserCount >= MAX_USER_MESSAGES) {
      setMessages([...updated, { role: 'assistant', content: LIMIT_MESSAGE }])
      return
    }

    setIsLoading(true)

    try {
      // Send only the new message — the server owns the conversation history.
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: apiText, sessionId }),
      })

      if (!res.ok) throw new Error('request failed')

      const data = await res.json()
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: data.reply, fitCard: data.fitCard },
      ])
    } catch {
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content:
            "Sorry, I'm having trouble connecting right now. Please try again in a moment.",
        },
      ])
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const handleChip = (chip: (typeof PROMPT_CHIPS)[number]) => {
    if (chip.match) {
      setMatchMode(true)
      inputRef.current?.focus()
    } else if (chip.value) {
      sendMessage(chip.value)
    }
  }

  // Show starter chips before the recruiter has said anything — regardless of
  // how they opened the panel (plain chat or the Role Fit CTA).
  const showChips = userMessageCount === 0
  // The role match takes longer (full-résumé retrieval); label the wait so it
  // reads as "thinking," not "stuck."
  const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user')
  const isMatchLoading = isLoading && !!lastUserMessage?.isMatch

  return (
    <>
      {!isOpen && (
        <div className="chat-fab-wrapper">
          <button
            className="chat-fab-label"
            onClick={() => window.dispatchEvent(new CustomEvent('open-role-fit'))}
          >
            See how I fit your role <span aria-hidden="true">→</span>
          </button>
          <button
            className="chat-fab"
            onClick={() => setIsOpen(true)}
            aria-label="Open chat"
          >
            <span className="chat-fab-ping" />
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </button>
        </div>
      )}

      {isOpen && (
        <div className="chat-panel" role="dialog" aria-label="Resume chat">
          <div className="chat-header">
            <span className="chat-header-title">Ask about Reid</span>
            <button
              className="chat-close"
              onClick={() => setIsOpen(false)}
              aria-label="Close chat"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {matchMode && (
            <div className="chat-subheader">
              <span className="chat-subheader-title">Role Fit</span>
              <span className="chat-subheader-desc">· paste a job description below</span>
              <button
                type="button"
                className="chat-subheader-cancel"
                onClick={() => setMatchMode(false)}
                aria-label="Cancel role fit"
              >
                ✕
              </button>
            </div>
          )}

          <div className="chat-messages">
            {messages.map((msg, i) =>
              msg.fitCard ? (
                <div key={i} className="fit-card-wrap">
                  <FitCard data={msg.fitCard} />
                  {msg.content && <p className="fit-followup">{msg.content}</p>}
                </div>
              ) : (
                <div key={i} className={`chat-bubble ${msg.role}`}>
                  {msg.role === 'assistant' ? (
                    <ReactMarkdown
                      components={{
                        a: ({ href, children }) => (
                          <a href={href} target="_blank" rel="noopener noreferrer" className="chat-link">
                            {children}
                          </a>
                        ),
                      }}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  ) : (
                    msg.content
                  )}
                </div>
              )
            )}
            {showChips && (
              <div className="chat-chips" role="group" aria-label="Suggested prompts">
                {PROMPT_CHIPS.filter((chip) => !(matchMode && chip.match)).map((chip) => (
                  <button
                    key={chip.label}
                    type="button"
                    className="chat-chip"
                    onClick={() => handleChip(chip)}
                    disabled={isLoading || isLimitReached}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            )}
            {isLoading && (
              <div className="chat-bubble assistant">
                {isMatchLoading && (
                  <span className="chat-loading-label">Reviewing résumé against the role</span>
                )}
                <span className="typing-dots">
                  <span />
                  <span />
                  <span />
                </span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <form
            className="chat-input-bar"
            onSubmit={(e) => {
              e.preventDefault()
              sendMessage()
            }}
          >
            <textarea
              ref={inputRef}
              className="chat-input"
              rows={1}
              value={input}
              onChange={(e) => {
                setInput(e.target.value)
                e.target.style.height = 'auto'
                e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
              }}
              onKeyDown={handleKeyDown}
              disabled={isLoading || isLimitReached}
              placeholder={
                isLimitReached
                  ? 'Message limit reached'
                  : matchMode
                    ? MATCH_PLACEHOLDER
                    : 'Ask a question, or paste a job description…'
              }
            />
            <button
              className="chat-send"
              type="submit"
              disabled={isLoading || isLimitReached || !input.trim()}
              aria-label="Send message"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </form>
        </div>
      )}
    </>
  )
}
