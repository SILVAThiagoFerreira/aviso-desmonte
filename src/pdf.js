export function safeFileName(value) {
  const normalized = String(value || 'aviso-de-desmonte').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return normalized.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'aviso-de-desmonte';
}

export function downloadReportPdf(canvas, metadata, config) {
  if (!window.jspdf?.jsPDF) throw new Error('A biblioteca de PDF não carregou. Verifique a conexão e tente novamente.');
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: [config.report.pageWidthPt, config.report.pageHeightPt], compress: true });
  pdf.addImage(canvas.toDataURL('image/jpeg', 0.94), 'JPEG', 0, 0, config.report.pageWidthPt, config.report.pageHeightPt, undefined, 'FAST');
  pdf.setProperties({ title: metadata.title || 'Aviso de Desmonte', subject: 'Área de influência do desmonte', author: metadata.company || 'Gerador de Aviso de Desmonte' });
  const datePart = metadata.date ? metadata.date.split('-').join('') : new Date().toISOString().slice(0, 10).replace(/-/g, '');
  pdf.save(`${safeFileName(metadata.title || 'aviso-de-desmonte')}-${datePart}.pdf`);
}
