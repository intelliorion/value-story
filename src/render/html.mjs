export function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Compose a self-contained HTML document.
// Contract: body and styles are trusted composition inputs whose fragments
// are built by leaf rendering functions (claimCard, heroDelta, chapters,
// constellation). Every user-supplied value must be escaped with esc() at the
// point it enters the markup. page() escapes only title; it trusts body and
// styles are pre-assembled HTML/CSS strings.
export function page({ title, styles, body }) {
  if (/<\/style/i.test(styles)) {
    throw new Error(`styles must not contain </style; found potential closing tag`);
  }
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>${styles}</style>
</head>
<body>
${body}
</body>
</html>
`;
}
