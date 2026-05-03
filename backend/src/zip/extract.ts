import AdmZip from 'adm-zip';

export type ExtractedPdf = { filename: string; buffer: Buffer };

const PDF_EXT_RE = /\.pdf$/i;

/**
 * Extracts all PDFs from a ZIP buffer. Skips directories and non-PDF entries.
 * Filenames are stripped to their basename to avoid path-traversal surprises.
 */
export function extractPdfsFromZip(zipBuffer: Buffer): ExtractedPdf[] {
  const zip = new AdmZip(zipBuffer);
  const out: ExtractedPdf[] = [];
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue;
    const name = entry.entryName;
    if (!PDF_EXT_RE.test(name)) continue;
    const basename = name.split(/[\\/]/).filter(Boolean).pop() ?? name;
    if (!basename || basename.startsWith('.')) continue;
    out.push({ filename: basename, buffer: entry.getData() });
  }
  return out;
}
