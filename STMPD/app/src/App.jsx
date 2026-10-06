import { useCallback, useEffect, useRef, useState } from 'react'
import PagePreview, { VIEW_SCALE } from './components/PagePreview.jsx'
import SignatureTool from './components/SignatureTool.jsx'
import AuthModal from './components/AuthModal.jsx'
import { openPdf, readFormFields, fillForm, renderPage } from './lib/pdf.js'
import { rasterizeAndStamp, tint, download } from './lib/stamp.js'
import { backendConfigured, getSession, onAuthChange, signOut, mapFields, consumeDownload } from './lib/backend.js'

const BLUE = '#0000FF'
const BLACK = '#000000'
let nextId = 1
const today = () => new Date().toLocaleDateString('en-US')

function guessType(label) {
  if (/signature|sign here/i.test(label)) return 'signature'
  if (/date/i.test(label)) return 'date'
  return 'text'
}

function makeField(p) {
  const type = p.type === 'signature' ? 'signature' : 'text'
  return {
    id: nextId++,
    label: p.label || 'Text',
    type,
    value: p.type === 'date' ? today() : p.value || '',
    page: p.page || 1,
    x: p.x ?? 0.1,
    y: p.y ?? 0.1,
    w: 0.25,
    size: 11,
  }
}

export default function App() {
  const [fileName, setFileName] = useState('')
  const [baseBytes, setBaseBytes] = useState(null)
  const [renderBytes, setRenderBytes] = useState(null)
  const [pdf, setPdf] = useState(null)
  const [pageSizes, setPageSizes] = useState([])
  const [fields, setFields] = useState([])
  const [formFields, setFormFields] = useState([])
  const [formValues, setFormValues] = useState({})
  const [selectedId, setSelectedId] = useState(null)
  const [activePage, setActivePage] = useState(1)
  const [ink, setInk] = useState(BLUE)
  const [sigRaw, setSigRaw] = useState(null)
  const [sigUrl, setSigUrl] = useState(null)
  const [useAI, setUseAI] = useState(backendConfigured)
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [session, setSession] = useState(null)
  const [showAuth, setShowAuth] = useState(false)
  const dropRef = useRef(null)

  useEffect(() => {
    getSession().then(setSession)
    return onAuthChange(setSession)
  }, [])

  useEffect(() => {
    if (sigRaw) tint(sigRaw, ink).then(setSigUrl)
    else setSigUrl(null)
  }, [sigRaw, ink])

  const loadDoc = useCallback(async (bytes) => {
    const doc = await openPdf(bytes)
    const sizes = []
    for (let i = 1; i <= doc.numPages; i++) {
      const v = (await doc.getPage(i)).getViewport({ scale: 1 })
      sizes.push({ w: v.width, h: v.height })
    }
    setPageSizes(sizes)
    setPdf(doc)
    return doc
  }, [])

  const handleFile = async (file) => {
    if (!file || file.type !== 'application/pdf') {
      setStatus('Please choose a PDF file.')
      return
    }
    setBusy(true)
    setStatus('Reading document…')
    setFields([])
    setFormValues({})
    setSelectedId(null)
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      setFileName(file.name)
      setBaseBytes(bytes)
      setRenderBytes(bytes)
      const doc = await loadDoc(bytes)
      const ff = await readFormFields(bytes)
      setFormFields(ff)
      if (ff.length) {
        setStatus(`Fillable form detected — ${ff.length} fields. Fill them on the left.`)
      } else if (useAI && backendConfigured) {
        setStatus('Analyzing layout with AI…')
        const pages = []
        for (let i = 1; i <= Math.min(doc.numPages, 10); i++) {
          const c = await renderPage(doc, i, 1.2)
          pages.push({ page: i, image: c.toDataURL('image/jpeg', 0.8).split(',')[1] })
        }
        try {
          const found = await mapFields(pages)
          setFields(found.map((f) => makeField({ ...f, type: guessType(f.label || '') })))
          setStatus(found.length ? 'Fields placed. Fill them in and nudge to align.' : 'No fields detected — add them manually.')
        } catch (e) {
          setStatus('AI mapping unavailable (' + e.message + '). Add fields manually.')
        }
      } else {
        setStatus('Click “Add text field”, then drag it onto the form.')
      }
    } catch (e) {
      setStatus('Could not open this PDF: ' + e.message)
    } finally {
      setBusy(false)
    }
  }

  // Fillable PDFs: fill + flatten in memory, re-render preview (debounced).
  useEffect(() => {
    if (!baseBytes || !formFields.length) return
    const t = setTimeout(async () => {
      const filled = await fillForm(baseBytes, formValues)
      setRenderBytes(filled)
      setPdf(await openPdf(filled))
    }, 450)
    return () => clearTimeout(t)
  }, [formValues, baseBytes, formFields.length])

  const patchField = useCallback((id, patch) => {
    setFields((fs) => fs.map((f) => (f.id === id ? { ...f, ...patch } : f)))
  }, [])

  const nudge = useCallback((dx, dy) => {
    setFields((fs) => fs.map((f) => {
      if (f.id !== selectedId) return f
      const s = pageSizes[f.page - 1]
      if (!s) return f
      return { ...f, x: f.x + dx / (s.w * VIEW_SCALE), y: f.y + dy / (s.h * VIEW_SCALE) }
    }))
  }, [selectedId, pageSizes])

  useEffect(() => {
    const onKey = (e) => {
      if (selectedId == null) return
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return
      const step = e.shiftKey ? 10 : 1
      const map = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }
      if (map[e.key]) {
        e.preventDefault()
        nudge(...map[e.key])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedId, nudge])

  const addText = () => {
    const f = makeField({ page: activePage, x: 0.15, y: 0.15 })
    setFields((fs) => [...fs, f])
    setSelectedId(f.id)
  }
  const addDate = () => {
    const f = makeField({ page: activePage, type: 'date', label: 'Date', x: 0.6, y: 0.15 })
    setFields((fs) => [...fs, f])
    setSelectedId(f.id)
  }
  const addSignature = () => {
    const f = makeField({ page: activePage, type: 'signature', label: 'Signature', x: 0.15, y: 0.8 })
    setFields((fs) => [...fs, f])
    setSelectedId(f.id)
  }
  const removeField = (id) => {
    setFields((fs) => fs.filter((f) => f.id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  const finalize = async () => {
    if (!consent) return setStatus('Please accept the electronic signature agreement first.')
    if (backendConfigured && !session) return setShowAuth(true)
    setBusy(true)
    setStatus('Finalizing — flattening pages…')
    try {
      const bytes = await rasterizeAndStamp(renderBytes, fields, ink, sigRaw)
      if (backendConfigured) {
        const r = await consumeDownload()
        if (!r.allowed) {
          setStatus(r.reason || 'Your free document has been used. Subscribe to continue.')
          return
        }
      }
      download(bytes, fileName.replace(/\.pdf$/i, '') + '-stamped.pdf')
      setStatus('Done. Your document has been downloaded.')
    } catch (e) {
      setStatus('Could not finalize: ' + e.message)
    } finally {
      setBusy(false)
    }
  }

  const reset = () => {
    setPdf(null)
    setBaseBytes(null)
    setRenderBytes(null)
    setFields([])
    setFormFields([])
    setStatus('')
    setConsent(false)
  }

  const selected = fields.find((f) => f.id === selectedId)

  return (
    <div className="app">
      <header>
        <div className="brand">
          <svg width="28" height="28" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#fff" /><path d="M18 20h28v7H18zM29 27h6v19h-6z" fill="#0f2747" /><rect x="18" y="49" width="28" height="4" rx="2" fill="#5b8def" /></svg>
          <span>STMPD</span>
        </div>
        <div className="hdr-right">
          {!backendConfigured && <span className="pill">Demo mode — no backend</span>}
          {backendConfigured && (session
            ? <button className="link light" onClick={signOut}>{session.user.email} · Sign out</button>
            : <button className="link light" onClick={() => setShowAuth(true)}>Sign in</button>)}
        </div>
      </header>

      {!pdf ? (
        <main className="landing">
          <h1>Fill and sign any PDF. Perfectly aligned.</h1>
          <p className="muted">Fillable or flat, forms and bank paperwork. Drop it in, type your details, nudge into place, download.</p>
          <div
            ref={dropRef}
            className="drop"
            onDragOver={(e) => { e.preventDefault(); dropRef.current.classList.add('over') }}
            onDragLeave={() => dropRef.current.classList.remove('over')}
            onDrop={(e) => { e.preventDefault(); dropRef.current.classList.remove('over'); handleFile(e.dataTransfer.files[0]) }}
          >
            <p>Drag & drop a PDF here</p>
            <label className="primary btn">Choose file
              <input hidden type="file" accept="application/pdf" onChange={(e) => handleFile(e.target.files[0])} />
            </label>
          </div>
          <label className="check">
            <input type="checkbox" checked={useAI} disabled={!backendConfigured} onChange={(e) => setUseAI(e.target.checked)} />
            <span>
              Use AI to detect fields on flat PDFs
              <small>{backendConfigured
                ? 'Page images are sent to an AI service for analysis. Turn off to stay fully local.'
                : 'Unavailable until the backend is connected. Everything runs in your browser.'}</small>
            </span>
          </label>
          {status && <p className="status">{status}</p>}
        </main>
      ) : (
        <main className="workspace">
          <aside className="panel">
            <div className="row between">
              <strong className="fname" title={fileName}>{fileName}</strong>
              <button className="link" onClick={reset}>Change file</button>
            </div>
            {status && <p className="status">{status}</p>}

            {formFields.length > 0 && (
              <section>
                <h4>Form fields</h4>
                {formFields.map((f) => (
                  f.kind === 'PDFCheckBox' ? (
                    <label key={f.name} className="check"><input type="checkbox" checked={!!formValues[f.name]} onChange={(e) => setFormValues((v) => ({ ...v, [f.name]: e.target.checked }))} />{f.name}</label>
                  ) : (
                    <label key={f.name} className="lbl">{f.name}
                      <input value={formValues[f.name] || ''} onChange={(e) => setFormValues((v) => ({ ...v, [f.name]: e.target.value }))} />
                    </label>
                  )
                ))}
              </section>
            )}

            <section>
              <h4>{formFields.length ? 'Extra fields' : 'Fields'}</h4>
              <div className="row">
                <button onClick={addText}>+ Text</button>
                <button onClick={addDate}>+ Date</button>
                <button onClick={addSignature} disabled={!sigRaw} title={sigRaw ? '' : 'Create a signature first'}>+ Signature</button>
              </div>
              {fields.filter((f) => f.type !== 'signature').map((f) => (
                <div key={f.id} className={'frow' + (f.id === selectedId ? ' sel' : '')} onClick={() => setSelectedId(f.id)}>
                  <small>{f.label} · p{f.page}</small>
                  <div className="row">
                    <input value={f.value} placeholder={f.label} onChange={(e) => patchField(f.id, { value: e.target.value })} onFocus={() => setSelectedId(f.id)} />
                    <button className="x" onClick={(e) => { e.stopPropagation(); removeField(f.id) }}>×</button>
                  </div>
                </div>
              ))}
              {fields.filter((f) => f.type === 'signature').map((f) => (
                <div key={f.id} className={'frow' + (f.id === selectedId ? ' sel' : '')} onClick={() => setSelectedId(f.id)}>
                  <small>Signature · p{f.page}</small>
                  <div className="row">
                    <input type="range" min="8" max="60" value={Math.round(f.w * 100)} onChange={(e) => patchField(f.id, { w: e.target.value / 100 })} />
                    <button className="x" onClick={(e) => { e.stopPropagation(); removeField(f.id) }}>×</button>
                  </div>
                </div>
              ))}
            </section>

            {selected && (
              <section>
                <h4>Nudge (1px · hold Shift for 10px)</h4>
                <div className="nudge">
                  <button onClick={() => nudge(0, -1)}>▲</button>
                  <div className="row">
                    <button onClick={() => nudge(-1, 0)}>◀</button>
                    <button onClick={() => nudge(0, 1)}>▼</button>
                    <button onClick={() => nudge(1, 0)}>▶</button>
                  </div>
                </div>
                {selected.type !== 'signature' && (
                  <label className="lbl">Font size
                    <input type="range" min="6" max="28" value={selected.size} onChange={(e) => patchField(selected.id, { size: +e.target.value })} />
                  </label>
                )}
              </section>
            )}

            <section>
              <h4>Ink</h4>
              <div className="row">
                <button className={ink === BLUE ? 'on' : ''} onClick={() => setInk(BLUE)}><i className="dot" style={{ background: BLUE }} />Bank blue</button>
                <button className={ink === BLACK ? 'on' : ''} onClick={() => setInk(BLACK)}><i className="dot" style={{ background: BLACK }} />Formal black</button>
              </div>
            </section>

            <section>
              <h4>Signature</h4>
              {sigUrl && <img className="sigprev" src={sigUrl} alt="your signature" />}
              <SignatureTool onSave={setSigRaw} />
            </section>

            <section>
              <label className="check">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                <span>I agree to sign electronically and that my e-signature is legally binding (E-SIGN / UETA).</span>
              </label>
              <button className="primary big" disabled={busy} onClick={finalize}>{busy ? 'Working…' : 'Finalize & download'}</button>
              <small className="muted">Pages are flattened into images so the result can’t be edited.</small>
            </section>
          </aside>

          <section className="viewer">
            {pdf && Array.from({ length: pdf.numPages }, (_, i) => (
              <PagePreview
                key={i + 1}
                pdf={pdf}
                pageNum={i + 1}
                fields={fields}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onMove={patchField}
                onActive={setActivePage}
                ink={ink}
                sigUrl={sigUrl}
              />
            ))}
          </section>
        </main>
      )}
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </div>
  )
}
