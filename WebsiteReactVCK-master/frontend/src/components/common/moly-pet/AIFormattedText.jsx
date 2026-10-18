import PropTypes from 'prop-types';
import RichMathText from '../RichMathText.jsx';

const BULLET_MARKER = String.raw`(?:[\u2022\u25cf\u25e6\u25aa\u25ab\u2023\u2043\u2219*]|\-|\u2013|\u2014|\u00b7|\u00e2\u20ac\u00a2|\u00e2\u20ac\u201c|\u00e2\u20ac\u201d)`;
const BULLET_ONLY_RE = new RegExp(`^${BULLET_MARKER}$`);
const BULLET_PREFIX_RE = new RegExp(`^${BULLET_MARKER}\\s+(.+)$`);

function stripInlineMarkdown(value) {
  return value
    .replace(/^#{1,6}\s+/, '')
    .replace(/^\*\*(.+)\*\*$/, '$1')
    .replace(/^__(.+)__$/, '$1')
    .trim();
}

function stripLooseMarkdown(value) {
  return value
    .replace(/\\([*_#])/g, '$1')
    .replace(/\*{3}([^*\n]+)\*{3}/g, '$1')
    .replace(/_{3}([^_\n]+)_{3}/g, '$1')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/__([^_\n]+)__/g, '$1')
    .replace(/\*\*+/g, '')
    .replace(/__+/g, '')
    .replace(/(^|\s)#+\s*/g, '$1')
    .trim();
}

function isSeparatorLine(value) {
  const text = value.replace(/\s+/g, '');
  return /^[-–—_]{3,}$/.test(text) || /^[−-]{3,}$/.test(text);
}

function normalizeLooseLatexCommands(value) {
  return value
    .replace(/\\{1,2}to\b/g, '→')
    .replace(/\\{1,2}leq?\b/g, '≤')
    .replace(/\\{1,2}geq?\b/g, '≥')
    .replace(/\\{1,2}ne(q)?\b/g, '≠')
    .replace(/\\{1,2}in\b/g, '∈')
    .replace(/\\{1,2}cup\b/g, '∪')
    .replace(/\\{1,2}cap\b/g, '∩')
    .replace(/\\{1,2}setminus\b/g, '∖')
    .replace(/\\{1,2}mathbb\{Z\}/g, 'ℤ')
    .replace(/\\{1,2}mathbb\{R\}/g, 'ℝ')
    .replace(/\\{1,2}mathbb\{N\}/g, 'ℕ');
}

function cleanupAIMarkup(value) {
  return normalizeLooseLatexCommands(stripLooseMarkdown(value))
    .replace(/\$\$+/g, '')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/\(\s*([A-Za-z])\s*\)/g, '($1)')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function hasMathSignal(value) {
  return /(\\\(|\\\[|\\\{|\\frac|\\sqrt|\\sum|\\int|\\cup|\\cap|\\setminus|\\ne|\\le|\\ge|[$=<>^_{}])/.test(value);
}

function isLikelySectionHeading(value) {
  const text = stripInlineMarkdown(value);
  if (text.length < 3 || text.length > 72) return false;
  if (hasMathSignal(text)) return false;
  if (/^[A-Z]\s*[:.)]/i.test(text)) return false;
  if (/[:\uFF1A]$/.test(text)) return true;
  if (/[?？]$/.test(text) && /^(vì sao|tai sao|tại sao|vi sao|cách|cach|lưu ý|luu y|nhận xét|nhan xet)/i.test(text)) return true;
  return false;
}

function formatSectionHeading(value) {
  const text = stripInlineMarkdown(value).replace(/[:\uFF1A]\s*$/, '').trim();
  return /[?？]$/.test(text) ? `**${text}**` : `**${text}:**`;
}

function formatLeadingLabel(value) {
  const match = value.match(/^([^:\uFF1A]{2,40}[:\uFF1A])\s+(.+)$/);
  if (!match) return value;

  const label = stripInlineMarkdown(match[1]).replace(/[:\uFF1A]\s*$/, '').trim();
  const body = match[2].trim();
  if (!label || !body || hasMathSignal(label)) return value;

  return `**${label}:** ${body}`;
}

function breakBeforeStudyLabels(value) {
  return value.replace(
    /\s+(?=(?:Ứng dụng|Kết luận|Mẹo nhớ|Lỗi hay gặp|Nên ôn thêm)\s*[:：])/gi,
    '\n',
  );
}

function normalizeCommonMathOcr(value) {
  return value
    .replace(/(^|[^A-Za-z\\])V\s*\{\s*(π|pi)\s*\}/gi, (_, prefix) => `${prefix}\\sqrt{\\pi}`)
    .replace(/(^|[^A-Za-z\\])V\s*(π|pi)(?=$|[^A-Za-z])/gi, (_, prefix) => `${prefix}\\sqrt{\\pi}`)
    .replace(/(?<![A-Za-z\\])sqrt\s*\(?\s*π\s*\)?/gi, String.raw`\sqrt{\pi}`)
    .replace(/(?<![A-Za-z\\])sqrt\s*\(?\s*pi\s*\)?/gi, String.raw`\sqrt{\pi}`)
    .replace(/(?<!\\)log_\s*([A-Za-zπ])\s*([A-Za-z])/g, (_, base, arg) => `\\log_{${base === 'π' ? '\\pi' : base}} ${arg}`)
    .replace(/(?<!\\)log\s*_\{\s*π\s*\}/g, String.raw`\log_{\pi}`)
    .replace(/([0-9])\s*\{\s*,\s*\}\s*([0-9])/g, '$1,$2')
    .replace(/π/g, String.raw`\pi`)
    .replace(/∞/g, String.raw`\infty`);
}

function normalizeAIFormattedText(value) {
  if (!value) return '';
  const lines = value
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .split('\n');

  const out = [];
  let pendingBullet = false;
  let inFence = false;

  const pushBlankBeforeHeading = () => {
    if (out.length > 0 && out[out.length - 1] !== '') out.push('');
  };

  for (const rawLine of lines) {
    const line = breakBeforeStudyLabels(cleanupAIMarkup(normalizeCommonMathOcr(rawLine.trim())));
    const fence = line.match(/^(```|~~~)/);

    if (fence) {
      pendingBullet = false;
      inFence = !inFence;
      out.push(rawLine);
      continue;
    }

    if (inFence) {
      out.push(rawLine);
      continue;
    }

    if (!line || isSeparatorLine(line)) {
      if (pendingBullet) continue;
      if (out.length > 0 && out[out.length - 1] !== '') out.push('');
      continue;
    }

    if (BULLET_ONLY_RE.test(line)) {
      pendingBullet = true;
      continue;
    }

    const bulletMatch = line.match(BULLET_PREFIX_RE);
    const bulletText = bulletMatch?.[1]?.trim();

    if (bulletText && isLikelySectionHeading(bulletText)) {
      pushBlankBeforeHeading();
      out.push(formatSectionHeading(bulletText));
      out.push('');
      pendingBullet = false;
      continue;
    }

    if (pendingBullet && isLikelySectionHeading(line)) {
      pushBlankBeforeHeading();
      out.push(formatSectionHeading(line));
      out.push('');
      pendingBullet = false;
      continue;
    }

    if (bulletText) {
      out.push(`- ${formatLeadingLabel(bulletText)}`);
      pendingBullet = false;
      continue;
    }

    if (pendingBullet) {
      out.push(`- ${formatLeadingLabel(line)}`);
      pendingBullet = false;
      continue;
    }

    if (isLikelySectionHeading(line)) {
      pushBlankBeforeHeading();
      out.push(formatSectionHeading(line));
      out.push('');
      continue;
    }

    out.push(formatLeadingLabel(breakBeforeStudyLabels(cleanupAIMarkup(normalizeCommonMathOcr(rawLine.trimEnd())))));
  }

  return out.join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/([^\n])\n(→\s*)/g, '$1\n\n$2')
    .trim();
}

export default function AIFormattedText({ value, className = '' }) {
  if (!value) return null;
  return <RichMathText value={normalizeAIFormattedText(value)} className={className} />;
}

AIFormattedText.propTypes = {
  value: PropTypes.string,
  className: PropTypes.string,
};
