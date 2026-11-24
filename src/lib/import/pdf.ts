// Lee el PDF dentro del navegador. El archivo no sale del dispositivo.

export async function extractLines(file: File): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/legacy/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString();

  const doc = await pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    isEvalSupported: false,
    verbosity: 0,
  }).promise;

  const lines: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const { items } = await page.getTextContent();
    const rows = new Map<number, { x: number; text: string }[]>();
    for (const item of items) {
      if (!('str' in item) || !item.str.trim()) continue;
      const y = Math.round(item.transform[5] / 2) * 2;
      if (!rows.has(y)) rows.set(y, []);
      rows.get(y)!.push({ x: item.transform[4], text: item.str.trim() });
    }
    const ordered = [...rows.entries()].sort((a, b) => b[0] - a[0]);
    for (const [, cells] of ordered) {
      lines.push(cells.sort((a, b) => a.x - b.x).map(c => c.text).join(' | '));
    }
  }
  await doc.destroy();
  return lines;
}
