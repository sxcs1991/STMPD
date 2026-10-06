import { useRef, useState } from 'react'
import SignatureCanvas from 'react-signature-canvas'
import { trimCanvas, typedSignature, uploadedSignature } from '../lib/sig.js'

const FONTS = ['Dancing Script', 'Caveat', 'Homemade Apple']

export default function SignatureTool({ onSave }) {
  const [tab, setTab] = useState('draw')
  const [text, setText] = useState('')
  const [font, setFont] = useState(FONTS[0])
  const pad = useRef(null)

  const saveDrawn = () => {
    if (!pad.current || pad.current.isEmpty()) return
    const url = trimCanvas(pad.current.getCanvas())
    if (url) onSave(url)
  }
  const saveTyped = async () => {
    if (!text.trim()) return
    const url = await typedSignature(text.trim(), font)
    if (url) onSave(url)
  }
  const saveUpload = async (e) => {
    const f = e.target.files?.[0]
    if (f) onSave(await uploadedSignature(f))
  }

  return (
    <div className="sigtool">
      <div className="tabs">
        {['draw', 'upload', 'type'].map((t) => (
          <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>
      {tab === 'draw' && (
        <>
          <SignatureCanvas ref={pad} penColor="#000" canvasProps={{ width: 300, height: 120, className: 'sigpad' }} />
          <div className="row">
            <button onClick={() => pad.current?.clear()}>Clear</button>
            <button className="primary" onClick={saveDrawn}>Use signature</button>
          </div>
        </>
      )}
      {tab === 'upload' && (
        <label className="upload">Choose a transparent PNG
          <input type="file" accept="image/png,image/*" onChange={saveUpload} />
        </label>
      )}
      {tab === 'type' && (
        <>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type your name" />
          <div className="fonts">
            {FONTS.map((f) => (
              <button key={f} className={font === f ? 'on' : ''} style={{ fontFamily: f }} onClick={() => setFont(f)}>{text || 'Signature'}</button>
            ))}
          </div>
          <button className="primary" onClick={saveTyped}>Use signature</button>
        </>
      )}
    </div>
  )
}
