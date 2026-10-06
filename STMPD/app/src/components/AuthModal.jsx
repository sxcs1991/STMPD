import { useState } from 'react'
import { signInWithEmail } from '../lib/backend.js'

export default function AuthModal({ onClose }) {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [err, setErr] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    setErr('')
    try {
      await signInWithEmail(email)
      setSent(true)
    } catch (ex) {
      setErr(ex.message)
    }
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Sign in to download</h3>
        <p className="muted">Your first finalized PDF is free. Enter your email and we'll send a sign-in link.</p>
        {sent ? (
          <p>Check your inbox for the link, then come back and press Download again.</p>
        ) : (
          <form onSubmit={submit}>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            <button className="primary" type="submit">Send link</button>
            {err && <p className="err">{err}</p>}
          </form>
        )}
        <button className="link" onClick={onClose}>Close</button>
      </div>
    </div>
  )
}
