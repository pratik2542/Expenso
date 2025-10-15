declare module 'pdf-parse' {
  interface PDFInfo {
    PDFFormatVersion?: string
    IsAcroFormPresent?: boolean
    IsXFAPresent?: boolean
    [key: string]: any
  }
  interface PDFMetadata {
    [key: string]: any
  }
  interface PDFText {
    numpages: number
    numrender: number
    info: PDFInfo
    metadata?: PDFMetadata
    version: string
    text: string
  }
  function pdfParse(dataBuffer: Buffer): Promise<PDFText>
  export = pdfParse
}
