// Static loader to ensure Next.js includes pdfjs-dist in the serverless trace
// These requires are attempted at module init so the files are traced and bundled.
let pdfjsLegacyCJS: any
let pdfjsBuildCJS: any
try { pdfjsLegacyCJS = require('pdfjs-dist/legacy/build/pdf.js') } catch {}
try { pdfjsBuildCJS = require('pdfjs-dist/build/pdf.js') } catch {}

export function getPdfjsStatic(): any | null {
  if (pdfjsLegacyCJS && typeof pdfjsLegacyCJS.getDocument === 'function') return pdfjsLegacyCJS
  if (pdfjsBuildCJS && typeof pdfjsBuildCJS.getDocument === 'function') return pdfjsBuildCJS
  return null
}
