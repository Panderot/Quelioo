/**
 * Small valid upload files built in memory for the Create file-tab tests (PDF, scanned PDF, encrypted PDF,
 * DOCX). No binary fixtures are committed; nothing here is imported by application code.
 */

/** About 60 plain words (letters only, so it survives PDF string escaping and every word counter). */
export const ARTICLE_SENTENCES = [
  'Photosynthesis is the process by which green plants turn light energy into chemical energy.',
  'Chlorophyll inside the leaves absorbs sunlight while the roots collect water from the soil.',
  'Carbon dioxide enters the leaf through tiny pores and combines with the water to make glucose.',
  'Oxygen is released into the air as a useful byproduct that animals and people breathe every day.',
  'Without this process almost no food chain on our planet could exist for very long.',
]

export const ARTICLE_TEXT = ARTICLE_SENTENCES.join(' ')

function asciiBuffer(text: string): Buffer {
  return Buffer.from(text, 'latin1')
}

/** A one-page PDF 1.4 with Helvetica text, one sentence per line (an empty list = a page with no text, i.e. a "scanned" PDF). */
export function buildPdf(lines: string[], options: { encrypted?: boolean } = {}): Buffer {
  const escaped = (line: string) => line.replace(/[\\()]/g, '\\$&')
  const content = lines.length > 0 ? `BT /F1 11 Tf 13 TL 40 760 Td ${lines.map((line) => `(${escaped(line)}) Tj T*`).join(' ')} ET` : 'q Q'
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  // A standard security handler whose owner/user hashes cannot match the empty password: opening it needs a password.
  if (options.encrypted) objects.push(`<< /Filter /Standard /V 1 /R 2 /O <${'ab'.repeat(32)}> /U <${'cd'.repeat(32)}> /P -4 >>`)

  let body = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((object, index) => {
    offsets.push(body.length)
    body += `${index + 1} 0 obj\n${object}\nendobj\n`
  })
  const xrefOffset = body.length
  const pad = (value: number) => String(value).padStart(10, '0')
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((offset) => `${pad(offset)} 00000 n \n`).join('')}`
  const id = `<${'12'.repeat(16)}>`
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R${options.encrypted ? ' /Encrypt 6 0 R' : ''} /ID [${id} ${id}] >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  return asciiBuffer(body)
}

const CRC_TABLE = (() => {
  const table: number[] = []
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table.push(c >>> 0)
  }
  return table
})()

function crc32(data: Buffer): number {
  let crc = 0xffffffff
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

/** A zip archive with stored (uncompressed) entries. */
function buildZip(entries: { name: string; data: string }[]): Buffer {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8')
    const data = Buffer.from(entry.data, 'utf8')
    const crc = crc32(data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0, 6)
    local.writeUInt16LE(0, 8)
    local.writeUInt16LE(0, 10)
    local.writeUInt16LE(33, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(name.length, 26)
    local.writeUInt16LE(0, 28)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0, 8)
    central.writeUInt16LE(0, 10)
    central.writeUInt16LE(0, 12)
    central.writeUInt16LE(33, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(data.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt32LE(offset, 42)
    locals.push(local, name, data)
    centrals.push(central, name)
    offset += local.length + name.length + data.length
  }
  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(centralSize, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, ...centrals, end])
}

/** A minimal Word document with one paragraph per text. */
export function buildDocx(paragraphs: string[]): Buffer {
  const xmlEscape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  const body = paragraphs.map((text) => `<w:p><w:r><w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r></w:p>`).join('')
  return buildZip([
    {
      name: '[Content_Types].xml',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    },
    {
      name: '_rels/.rels',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    },
    {
      name: 'word/document.xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`,
    },
  ])
}
