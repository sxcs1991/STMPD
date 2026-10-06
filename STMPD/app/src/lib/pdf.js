import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { PDFDocument } from 'pdf-lib'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

// pdf.js transfers the buffer to its worker, so always hand it a copy.
export async function openPdf(bytes) {
  return pdfjs.getDocument({ data: bytes.slice(0) }).promise
}

export async function renderPage(pdf, pageNumber, scale) {
  const page = await pdf.getPage(pageNumber)
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
  return canvas
}

// Fillable PDFs: list the AcroForm fields we can fill directly.
export async function readFormFields(bytes) {
  try {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true })
    const form = doc.getForm()
    return form
      .getFields()
      .map((f) => ({ name: f.getName(), kind: f.constructor.name }))
      .filter((f) => ['PDFTextField', 'PDFCheckBox'].includes(f.kind))
  } catch {
    return []
  }
}

// Fill AcroForm values and flatten so pdf.js renders them as page content.
export async function fillForm(bytes, values) {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true })
  const form = doc.getForm()
  for (const [name, value] of Object.entries(values)) {
    try {
      const field = form.getField(name)
      if (field.constructor.name === 'PDFTextField') field.setText(String(value ?? ''))
      else if (field.constructor.name === 'PDFCheckBox') value ? field.check() : field.uncheck()
    } catch {
      /* skip fields that can't be set */
    }
  }
  form.flatten()
  return doc.save()
}
