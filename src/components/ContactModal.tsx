import { useState, useRef, useEffect } from 'react'
import './ContactModal.css'

interface ContactModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function ContactModal({ isOpen, onClose }: ContactModalProps) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => nameRef.current?.focus(), 100)
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const canSubmit = name.trim() && email.trim() && message.trim() && status !== 'sending'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return

    setStatus('sending')

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), message: message.trim() }),
      })

      if (!res.ok) throw new Error('request failed')
      setStatus('sent')
    } catch {
      setStatus('error')
    }
  }

  return (
    <div className="contact-overlay" onClick={onClose}>
      <div
        className="contact-modal"
        role="dialog"
        aria-label="Contact Reid"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="contact-modal-header">
          <span className="contact-modal-title">Contact Reid</span>
          <button className="contact-modal-close" onClick={onClose} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {status === 'sent' ? (
          <div className="contact-modal-body contact-success">
            <p>Thanks! Reid will be in touch.</p>
          </div>
        ) : (
          <form className="contact-modal-body" onSubmit={handleSubmit}>
            <label className="contact-field">
              <span>Name</span>
              <input
                ref={nameRef}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={status === 'sending'}
              />
            </label>
            <label className="contact-field">
              <span>Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={status === 'sending'}
              />
            </label>
            <label className="contact-field">
              <span>Message</span>
              <textarea
                rows={4}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                disabled={status === 'sending'}
              />
            </label>
            {status === 'error' && (
              <p className="contact-error">Something went wrong. Please try again.</p>
            )}
            <button className="contact-submit" type="submit" disabled={!canSubmit}>
              {status === 'sending' ? 'Sending...' : 'Send Message'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
