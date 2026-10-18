import { memo, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import katex from 'katex';
import rehypeKatex from 'rehype-katex';
import rehypeSanitize from 'rehype-sanitize';
import remarkMath from 'remark-math';
import 'katex/dist/katex.min.css';

import { isLikelyLooseMathLine, normalizeLatexMath, normalizeRichMathText } from '../../features/quizzes/math/normalizeMath.js';
import { isPlainTextMathValue, stripPlainTextMathMarker } from '../../features/quizzes/math/plainTextMathMode.js';

function tidyReadableBreaks(value) {
  return value
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function applyReadableBreakRules(value) {
  return value
    .replace(/\s*((?:前\s*n\s*[项項]和公式|通[项項]公式|代入(?:数据|數據)?解不等式|验证|驗證|检验|檢驗|结论|結論|所以)\s*[:：])/g, '\n$1')
    .replace(/\s*((?:Công thức|Thay|Kiểm tra|Kết luận|Chọn|Vậy)\s*[:：])/gi, '\n$1')
    .replace(/\s*((?:考[虑慮]?|考虑|考慮)\s*[A-H]\s*[：:])/g, '\n$1')
    .replace(/\s*((?:垂直条件|垂直條件|计算|計算|方程组|方程組|由两西不等式|由两式不等式|由兩式不等式)\s*[:：])/g, '\n$1')
    .replace(/\s*((?:步骤|步驟|Bước)\s*\d+\s*(?:[（(][^）)]{1,24}[）)])?\s*[:：])/gi, '\n$1')
    .replace(/\s*(⇔|=>|⇒|\\Rightarrow)\s*/g, '\n$1 ')
    .replace(/([。.;；])\s*(?=(?:过点|過點|设直线|設直線|考虑|考慮|由|由于|因|当|比較|比较|代入|验证|驗證|因此|所以|故|选|答案|解析|得|Suy ra|Vậy|n\s*=))/g, '$1\n')
    .replace(/([，,])\s*(?=(?:n|x|m|k)\s*=\s*-?\d+\s*(?:时|時))/g, '$1\n')
    .replace(/[，,]\s*(?=(?:代入|值域|定义域|反函数|由于|因此|所以|故|选|答案|得))/g, '，\n')
    .replace(/([:：])\s*(?=(?:[A-Za-z0-9\\(√]|\\log|\\frac|\\sqrt))/g, '$1\n')
    .replace(/\s*(选\s*[A-H][.。]?)/gi, '\n$1')
    .replace(/\n\s*\n(?=(?:⇔|=>|⇒|\\Rightarrow))/g, '\n');
}

function restoreReadableBreaks(value) {
  const normalized = value
    .replace(/\\n/g, '\n')
    .replace(/\r\n?/g, '\n');

  return tidyReadableBreaks(applyReadableBreakRules(normalized));
}

function shouldRenderNaturalLanguagePlainText(value) {
  const text = value.trim();
  if (!text || /[\u4e00-\u9fff]/.test(text)) return false;

  if (
    /(?:\\\(|\\\[|\$\$?|\\(?:frac|dfrac|tfrac|sqrt|sin|cos|tan|cot|sec|csc|log|ln|lg|vec|binom|mathbb|mathrm)\b)/.test(
      text,
    )
  ) {
    return false;
  }

  const words = text.match(/\b[A-Za-z]{2,}\b/g) || [];
  return words.length >= 4 && /[.!?:;]/.test(text);
}

function canRenderLatex(formula, displayMode = false) {
  try {
    katex.renderToString(formula.trim(), {
      displayMode,
      throwOnError: true,
      strict: false,
      trust: false,
    });
    return true;
  } catch {
    return false;
  }
}

function stripMathPunctuation(formula) {
  const trimmed = formula.trim();
  const match = trimmed.match(/^([\s\S]*?)([.,;:，。；：]+)$/);
  if (!match) return { formula: trimmed, suffix: '' };
  return { formula: match[1].trim(), suffix: match[2] };
}

function escapeFailedMathText(value) {
  return value.replace(/\$/g, '\\$');
}

function normalizeRenderableLatex(formula, displayMode = false) {
  const raw = formula.trim();
  const stripped = stripMathPunctuation(raw);
  const candidates = [
    { formula: raw, suffix: '' },
    { formula: normalizeLatexMath(raw), suffix: '' },
    stripped,
    { formula: normalizeLatexMath(stripped.formula), suffix: stripped.suffix },
  ]
    .map(candidate => ({
      formula: candidate.formula
        .replace(/\\left\s+(?=[,.;:，。；：]|$)/g, '')
        .replace(/\\right\s+(?=[,.;:，。；：]|$)/g, '')
        .trim(),
      suffix: candidate.suffix,
    }))
    .filter(candidate => candidate.formula);

  for (const candidate of candidates) {
    if (canRenderLatex(candidate.formula, displayMode)) return candidate;
  }

  return null;
}

function sanitizeInlineMath(formula) {
  const renderable = normalizeRenderableLatex(formula, false);
  if (renderable) return `$${renderable.formula}$${renderable.suffix}`;
  return escapeFailedMathText(formula.trim());
}

function sanitizeDisplayMath(formula) {
  const renderable = normalizeRenderableLatex(formula, true);
  if (renderable) return `$$\n${renderable.formula}\n$$${renderable.suffix}`;
  return escapeFailedMathText(formula.trim());
}

function sanitizeKatexSegments(value) {
  return value
    .split(/(```[\s\S]*?```|~~~[\s\S]*?~~~)/g)
    .map((part) => {
      if (part.startsWith('```') || part.startsWith('~~~')) return part;

      return part
        .split(/(`[^`\n]*`)/g)
        .map((inlinePart) => {
          if (inlinePart.startsWith('`')) return inlinePart;

          return inlinePart
            .replace(/\$\$([\s\S]*?)\$\$/g, (_, formula) => sanitizeDisplayMath(formula))
            .replace(/\$([^$\n]*?)\$/g, (_, formula) => sanitizeInlineMath(formula));
        })
        .join('');
    })
    .join('');
}

function autoWrapLooseMathLines(text) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const out = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.includes('$') || !isLikelyLooseMathLine(line)) {
      out.push(line);
      continue;
    }

    const group = [line];
    while (i + 1 < lines.length && !lines[i + 1].includes('$') && isLikelyLooseMathLine(lines[i + 1])) {
      group.push(lines[i + 1]);
      i++;
    }

    out.push(`$${normalizeLatexMath(group.join('\n'))}$`);
  }

  return out.join('\n');
}

function normalizeMathDelimiters(value) {
  const normalizeText = (text) =>
    autoWrapLooseMathLines(
      normalizeRichMathText(text)
        .replace(/\\\[([\s\S]*?)\\\]/g, (_, formula) => `$$\n${normalizeLatexMath(formula)}\n$$`)
        .replace(/\\\(([\s\S]*?)\\\)/g, (_, formula) => `$${normalizeLatexMath(formula)}$`)
        .replace(/(^|\n)\$\$([^\n]+?)\$\$(?=\n|$)/g, (_, prefix, formula) => `${prefix}$$\n${normalizeLatexMath(formula)}\n$$`),
    );

  const normalized = value
    .replace(/\r\n?/g, '\n')
    .split(/(```[\s\S]*?```|~~~[\s\S]*?~~~)/g)
    .map((part) => {
      if (part.startsWith('```') || part.startsWith('~~~')) return part;

      return part
        .split(/(`[^`\n]*`)/g)
        .map((inlinePart) => (inlinePart.startsWith('`') ? inlinePart : normalizeText(inlinePart)))
        .join('');
    })
    .join('');

  return sanitizeKatexSegments(normalized);
}

function RichMathText({ value = '', className = '', readableBreaks = false }) {
  const isPlainText = isPlainTextMathValue(value);
  const cleanValue = stripPlainTextMathMarker(value);
  const preserveNaturalLanguage = shouldRenderNaturalLanguagePlainText(cleanValue);
  const source = useMemo(
    () => (readableBreaks ? restoreReadableBreaks(cleanValue) : cleanValue),
    [readableBreaks, cleanValue],
  );
  const markdown = useMemo(
    () => (preserveNaturalLanguage || !source ? '' : normalizeMathDelimiters(source)),
    [preserveNaturalLanguage, source],
  );

  if (!value) return null;

  if (isPlainText) {
    return (
      <div className={`rich-math-text max-w-full break-words whitespace-pre-wrap text-sm leading-relaxed [&_.katex]:text-current [&_.katex_*]:text-current ${className}`}>
        {source}
      </div>
    );
  }

  if (preserveNaturalLanguage) {
    return (
      <div className={`rich-math-text max-w-full break-words whitespace-pre-wrap text-sm leading-relaxed ${className}`}>
        {source}
      </div>
    );
  }

  return (
    <div className={`rich-math-text max-w-full break-words text-sm leading-relaxed [&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden [&_.katex-display]:max-w-full [&_.katex-display]:py-1 [&_.katex]:text-current [&_.katex_*]:text-current ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[
          rehypeSanitize,
          [rehypeKatex, { throwOnError: false, strict: false, errorColor: 'currentColor' }],
        ]}
        components={{
          p: ({ children }) => <p className="mb-2 whitespace-pre-wrap last:mb-0">{children}</p>,
          ul: ({ children }) => <ul className="mb-2 list-disc pl-5 space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="mb-2 list-decimal pl-5 space-y-1">{children}</ol>,
          li: ({ children }) => <li>{children}</li>,
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          code: ({ children }) => (
            <code className="rounded bg-black/5 px-1 py-0.5 font-mono text-[0.92em]">
              {children}
            </code>
          ),
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}

export default memo(RichMathText);
