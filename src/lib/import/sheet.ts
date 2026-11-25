// Lee Excel (.xls/.xlsx) dentro del navegador, igual que los PDF: el archivo no sale del dispositivo.

export async function extractSheetLines(file: File): Promise<string[]> {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array' });
  const lines: string[] = [];
  for (const name of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], { header: 1, raw: false, defval: '' });
    for (const row of rows) {
      const cells = row.map(c => String(c).trim()).filter(Boolean);
      if (cells.length) lines.push(cells.join(' | '));
    }
  }
  return lines;
}
