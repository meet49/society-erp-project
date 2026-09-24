function getPath(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => (acc && typeof acc === 'object' ? (acc as any)[key] : undefined), obj);
}

export function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Minimal, safe template renderer: {{var}} placeholders (dot paths) and {{#var}}...{{/var}} blocks
 * rendered only when the variable is truthy. Values are HTML-escaped when `html` is true.
 */
export function renderTemplate(template: string, vars: Record<string, unknown>, opts: { html?: boolean } = {}): string {
  let out = template.replace(/{{#([\w.]+)}}([\s\S]*?){{\/\1}}/g, (_m, key: string, inner: string) => (getPath(vars, key) ? inner : ''));
  out = out.replace(/{{\s*([\w.]+)\s*}}/g, (_m, key: string) => {
    const v = getPath(vars, key);
    if (v === undefined || v === null) return '';
    const str = v instanceof Date ? v.toLocaleString('en-IN') : String(v);
    return opts.html ? escapeHtml(str) : str;
  });
  return out;
}

export function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function wrapEmailLayout(bodyHtml: string, brand: { name: string; primaryColor?: string; appUrl?: string }): string {
  const color = brand.primaryColor || '#4f46e5';
  return `<!doctype html><html><body style="margin:0;background:#f4f5f7;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2937">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:24px">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden">
<tr><td style="background:${color};padding:20px 28px;color:#fff;font-size:18px;font-weight:600">${escapeHtml(brand.name)}</td></tr>
<tr><td style="padding:28px;font-size:15px;line-height:1.6">${bodyHtml}</td></tr>
<tr><td style="padding:16px 28px;font-size:12px;color:#6b7280;border-top:1px solid #e5e7eb">Sent by ${escapeHtml(brand.name)}${brand.appUrl ? ` · <a href="${brand.appUrl}" style="color:${color}">Open app</a>` : ''}</td></tr>
</table></td></tr></table></body></html>`;
}
