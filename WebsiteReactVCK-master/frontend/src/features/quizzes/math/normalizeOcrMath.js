import {
  normalizeEscapedLatexBackslashes,
  normalizeLatexMath,
  normalizeRichMathText,
} from './normalizeMath.js';

const COMMAND_RE =
  /\\(?:sin|cos|tan|cot|sec|csc|log|ln|lg|sqrt|lim|sum|int|vec|bar|hat|tilde|frac|binom|infty|cup|cap|circ|pi|alpha|beta|gamma|delta|theta|lambda|mu|Rightarrow|Leftrightarrow|to|le|ge|ne|approx)\b/;
const DELIMITED_MATH_RE = /(\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]|\$\$[\s\S]*?\$\$|\$[^$\n]*\$|`[^`\n]*`)/g;

const GREEK_REPLACEMENTS = [
  [/\u03b1/g, '\\alpha '],
  [/\u03b2/g, '\\beta '],
  [/\u03b3/g, '\\gamma '],
  [/\u03b4/g, '\\delta '],
  [/\u03b8/g, '\\theta '],
  [/\u03bb/g, '\\lambda '],
  [/\u03bc/g, '\\mu '],
  [/\u03c0/g, '\\pi '],
  [/\ud6fc/g, '\\alpha '],
];

function cleanOcrMathInput(input) {
  return normalizeEscapedLatexBackslashes(input)
    .replace(/(^|[^\\])\\[ \t]+/g, '$1 ')
    .replace(/^\s*\\quad\s+/i, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizeSymbols(input) {
  return GREEK_REPLACEMENTS.reduce((value, [pattern, replacement]) => value.replace(pattern, replacement), input)
    .replace(/\u2212/g, '-')
    .replace(/\u2260/g, '\\ne ')
    .replace(/\u2264/g, '\\le ')
    .replace(/\u2265/g, '\\ge ')
    .replace(/\u2248/g, '\\approx ')
    .replace(/\u221e/g, '\\infty ')
    .replace(/\u2208/g, '\\in ')
    .replace(/\u2209/g, '\\notin ')
    .replace(/\u222a/g, '\\cup ')
    .replace(/\u2229/g, '\\cap ')
    .replace(/\u00d7/g, '\\times ')
    .replace(/\u00f7/g, '\\div ')
    .replace(/\u00b1/g, '\\pm ')
    .replace(/\u21d4/g, '\\Leftrightarrow ')
    .replace(/\u21d2/g, '\\Rightarrow ')
    .replace(/\u2192/g, '\\to ')
    .replace(/<=>/g, '\\Leftrightarrow ')
    .replace(/=>/g, '\\Rightarrow ')
    .replace(/->/g, '\\to ');
}

function normalizeRoots(input) {
  return input
    .replace(
      /\u221a\s*([0-9]+)\s*(sin|cos|tan|cot|sec|csc)(?=(?:\\[A-Za-z]+|[A-Za-z]))/gi,
      (_, radicand, fn) => `\\sqrt{${radicand}}\\${fn.toLowerCase()} `,
    )
    .replace(
      /\\sqrt\{\}\s*([0-9]+)\s*(sin|cos|tan|cot|sec|csc)(?=(?:\\[A-Za-z]+|[A-Za-z]))/gi,
      (_, radicand, fn) => `\\sqrt{${radicand}}\\${fn.toLowerCase()} `,
    )
    .replace(/\u221a\s*\(([^()]+)\)/g, '\\sqrt{$1}')
    .replace(/\u221a\s*((?:\\[A-Za-z]+|[A-Za-z0-9]+)(?:\^[{]?[A-Za-z0-9]+[}]?)?)/g, '\\sqrt{$1}')
    .replace(/\bsqrt\s*\(([^()]+)\)/gi, '\\sqrt{$1}')
    .replace(/\bsqrt\s+((?:\\[A-Za-z]+|[A-Za-z0-9]+)(?:\^[{]?[A-Za-z0-9]+[}]?)?)/gi, '\\sqrt{$1}');
}

function repairOcrFractionEchoes(input) {
  return input
    .replace(
      /=\s*([+-])?\s*(\d+)\s+(\d+)\s*=\s*\3\s*([+-])?\s*\2\b/g,
      (_, firstSign, numerator, denominator, secondSign) => {
        const sign = firstSign || secondSign || '';
        return `= ${sign}\\frac{${numerator}}{${denominator}}`;
      },
    )
    .replace(
      /=\s*([+-])?\s*(\d+)\s+(\d+)(?=\s*(?:[,，;；。]|\\|$))/g,
      (_, sign, numerator, denominator) => `= ${sign || ''}\\frac{${numerator}}{${denominator}}`,
    );
}

function normalizeFunctions(input) {
  return input
    .replace(/\blog\s*_\s*([0-9A-Za-z]+)\s+/gi, '\\log_{$1} ')
    .replace(/(^|[^\\A-Za-z])log\s*([0-9]+)\s*\/\s*([0-9]+)\s*([A-Za-z0-9\\]+)\b/gi, '$1\\log_{\\frac{$2}{$3}} $4')
    .replace(/\blog\s*([0-9]+)\s*\/\s*([0-9]+)\s*([A-Za-z0-9\\]+)\b/gi, '\\log_{\\frac{$1}{$2}} $3')
    .replace(/\\log\s*([0-9]+)\s*\/\s*([0-9]+)\s*([A-Za-z0-9\\]+)\b/g, '\\log_{\\frac{$1}{$2}} $3')
    .replace(/(^|[^\\A-Za-z])log\s*\^\s*\{?([0-9]+)\}?\s*\/\s*([0-9]+)\s+([0-9]+)(?:\s+\3\s+\4)?/gi, '$1\\log_{\\frac{$3}{$2}} $4')
    .replace(/\blog\s*\^\s*\{?([0-9]+)\}?\s*\/\s*([0-9]+)\s+([0-9]+)(?:\s+\2\s+\3)?/gi, '\\log_{\\frac{$2}{$1}} $3')
    .replace(/\\log\s*\^\s*\{?([0-9]+)\}?\s*\/\s*([0-9]+)\s+([0-9]+)(?:\s+\2\s+\3)?/gi, '\\log_{\\frac{$2}{$1}} $3')
    .replace(/\blog\s+([2-9])([0-9])\b/gi, '\\log_{$1} $2')
    .replace(/\blog([0-9]+)\s+/gi, '\\log_{$1} ')
    .replace(/(^|[^\\A-Za-z])(sin|cos|tan|cot|sec|csc)(?=\d)/gi, (_, prefix, fn) => `${prefix}\\${fn.toLowerCase()} `)
    .replace(/(^|[^\\A-Za-z])(sin|cos|tan|cot|sec|csc)([xyzt])\b/gi, (_, prefix, fn, variable) => `${prefix}\\${fn.toLowerCase()} ${variable}`)
    .replace(/(^|[^\\A-Za-z])(sin|cos|tan|cot|sec|csc|ln|lg|log)\b\s*/gi, (_, prefix, fn) => `${prefix}\\${fn.toLowerCase()} `)
    .replace(/\\(sin|cos|tan|cot|sec|csc|ln|lg|log)\s+([0-9]+)\s*(?:\u00b0|\^?\\?circ|\u5ea6)/gi, '\\$1 $2^\\circ');
}

function normalizeDegrees(input) {
  return input.replace(/([0-9]+(?:\.[0-9]+)?)\s*(?:\u00b0|\u5ea6)/g, '$1^\\circ');
}

function normalizeOcrPowers(input) {
  return input.replace(
    /(^|[=+\-*/(,]\s*)([2-9])\s+([0-9])(?=\s*(?:[=+\-*/),，。;；]|$))/g,
    '$1$2^{$3}',
  );
}

function normalizeDecorators(input) {
  return input
    .replace(/\\(vec|bar|hat|tilde)\s+([A-Za-z])/g, '\\$1{$2}')
    .replace(/\|\s*\\vec\{([A-Za-z])\}\s*\|/g, '|\\vec{$1}|');
}

function normalizeCombinatorics(input) {
  return input
    .replace(/\b([CA])\s*\(\s*([^,()]+)\s*,\s*([^()]+)\s*\)/g, '$1_{$2}^{$3}')
    .replace(/\b([CA])\s*[_]?\s*([A-Za-z0-9]+)\s*\^\s*([A-Za-z0-9]+)/g, '$1_{$2}^{$3}');
}

function normalizeCalculus(input) {
  return input
    .replace(/\blim\s*([A-Za-z])\s*\\to\s*([^\s,;]+)/gi, '\\lim_{$1 \\to $2}')
    .replace(/\bsum\s+([A-Za-z])\s*=\s*([^\s]+)\s+(?:to|\u5230)\s+([^\s,;]+)/gi, '\\sum_{$1=$2}^{$3}')
    .replace(/\bint\s+([^\s]+)\s+(?:to|\u5230)\s+([^\s,;]+)/gi, '\\int_{$1}^{$2}')
    .replace(/\u2211\s*([A-Za-z])\s*=\s*([^\s]+)\s*(?:to|\u5230)\s*([^\s,;]+)/g, '\\sum_{$1=$2}^{$3}')
    .replace(/\u222b\s*([^\s]+)\s*(?:to|\u5230)\s*([^\s,;]+)/g, '\\int_{$1}^{$2}')
    .replace(/\u2211/g, '\\sum ')
    .replace(/\u222b/g, '\\int ');
}

function normalizeFunctionFractions(input) {
  return input
    .replace(/([A-Za-z0-9])\(([^()]+)\)\s*\/\s*([A-Za-z0-9]+)(?=\s*(?:=|\\Rightarrow|\\Leftrightarrow|,|;|$))/g, '\\frac{$1($2)}{$3}')
    .replace(
      /(\\(?:sin|cos|tan|cot|sec|csc|ln|lg|log)\s+[^/\s]+)\s*\/\s*([A-Za-z0-9]+)(?=\s*(?:=|\\Rightarrow|\\Leftrightarrow|,|;|$))/g,
      '\\frac{$1}{$2}',
    );
}

function normalizeIntervals(input) {
  return input
    .replace(/(^|[\s(,])\+\s*\\infty/g, '$1+\\infty')
    .replace(/(^|[\s(,])-\s*\\infty/g, '$1-\\infty')
    .replace(/\bU\b(?=\s*[[(])/g, '\\cup ');
}

function normalizeOcrSubscripts(input) {
  return input
    .replace(/\b([A-Za-z])\s+([0-9])\b/g, '$1_{$2}')
    .replace(/\b([A-Za-z])([0-9])\b/g, '$1_{$2}');
}

function applyOcrMathRules(input) {
  return normalizeOcrSubscripts(
    normalizeIntervals(
      normalizeFunctionFractions(
        normalizeCalculus(
          normalizeCombinatorics(
            normalizeDecorators(
              normalizeDegrees(
                normalizeOcrPowers(
                  normalizeFunctions(
                    normalizeRoots(
                      repairOcrFractionEchoes(normalizeSymbols(input)),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  );
}

function isMathishChar(char) {
  return /[A-Za-z0-9\\{}()[\]^_+\-*/=<>.,|:&\s]/.test(char);
}

function wrapCommandMathInSegment(segment) {
  let out = '';
  let cursor = 0;

  while (cursor < segment.length) {
    const rest = segment.slice(cursor);
    const match = rest.match(COMMAND_RE);
    if (!match || match.index === undefined) {
      out += rest;
      break;
    }

    const commandIndex = cursor + match.index;
    let start = commandIndex;
    let end = commandIndex + match[0].length;

    while (start > cursor && isMathishChar(segment[start - 1])) start--;
    while (end < segment.length && isMathishChar(segment[end])) end++;

    const raw = segment.slice(start, end);
    const leading = raw.match(/^\s*/)?.[0] || '';
    const trailing = raw.match(/\s*$/)?.[0] || '';
    const core = raw.slice(leading.length, raw.length - trailing.length);

    out += segment.slice(cursor, start);
    out += core ? `${leading}\\(${normalizeLatexMath(core)}\\)${trailing}` : raw;
    cursor = end;
  }

  return out;
}

function wrapCommandMath(input) {
  return input
    .split(DELIMITED_MATH_RE)
    .map(part => {
      if (
        !part ||
        part.startsWith('\\(') ||
        part.startsWith('\\[') ||
        part.startsWith('$$') ||
        part.startsWith('$') ||
        part.startsWith('`')
      ) return part;

      return wrapCommandMathInSegment(part);
    })
    .join('');
}

function buildCasesFromLines(lines) {
  const expandedLines = lines.flatMap(line => (
    (line.match(/=/g) || []).length > 1 ? splitJoinedEquations(line) : [line]
  ));
  const equations = expandedLines
    .map(line => line.trim())
    .filter(line => {
      const eq = line.indexOf('=');
      return eq > 0 && line.slice(eq + 1).trim().length > 0;
    });

  if (equations.length < 2) return '';
  if (equations.some(line => /[\u3400-\u9fff]/.test(line))) return '';

  const rows = equations.map(line => {
    const eq = line.indexOf('=');
    const left = normalizeLatexMath(line.slice(0, eq).trim());
    const right = normalizeLatexMath(line.slice(eq + 1).trim());
    return `${left}&=${right}`;
  });

  return `\\(\\begin{cases}${rows.join(' \\\\ ')}\\end{cases}\\)`;
}

function stripCaseMathDelimiters(input) {
  return input
    .replace(/\\\(|\\\)|\\\[|\\\]/g, '')
    .replace(/\$+/g, '');
}

function repairCaseSubscripts(input) {
  const subscriptLetters = new Set(
    Array.from(input.matchAll(/\b([A-Za-z])(?:_\{?\d+\}?|\s+\d)\b/g)).map(match => match[1]),
  );
  if (!subscriptLetters.size) return input;

  return input.replace(/\b([A-Za-z])\s*\^\s*\{?([0-9])\}?/g, (match, letter, index) => {
    if (!subscriptLetters.has(letter)) return match;
    return `${letter}_{${index}}`;
  });
}

function splitJoinedEquations(input) {
  const compact = normalizeOcrSubscripts(repairCaseSubscripts(stripCaseMathDelimiters(input)).replace(/[{}\s]+/g, ''));
  const separated = compact.replace(
    /(=[+-]?(?:\d+(?:\.\d+)?|[A-Za-z](?:_\{[^{}]+\})?|\\frac\{[^{}]+\}\{[^{}]+\}))(?=[A-Za-z\\])/g,
    '$1\n',
  );

  return separated
    .split(/[;\n]+/)
    .map(line => line.trim())
    .filter(Boolean);
}

function buildCasesFromText(input) {
  const repairedInput = repairCaseSubscripts(stripCaseMathDelimiters(input));
  const lines = repairedInput
    .split(/[;\n]+/)
    .map(line => line.trim())
    .filter(Boolean);

  const joined = buildCasesFromLines(splitJoinedEquations(repairedInput));
  if (joined) return joined;

  return buildCasesFromLines(lines.map(repairCaseSubscripts));
}

function isCaseMathCandidate(line) {
  return /^[{}A-Za-z0-9\\()[\]^_+\-*/=<>.,|&\s]+$/.test(line);
}

function splitInlineCaseSuffix(input) {
  const cjkIndex = input.search(/[\u3400-\u9fff]/);
  if (cjkIndex < 0) return { math: input, suffix: '' };

  return {
    math: input.slice(0, cjkIndex).replace(/[，,;；。.\s]+$/, '').trim(),
    suffix: input.slice(cjkIndex).trim(),
  };
}

function replaceBraceCaseBlocks(input) {
  const lines = input.split('\n');
  const out = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const braceIndex = line.indexOf('{');
    const beforeBrace = braceIndex === -1 ? '' : line.slice(0, braceIndex);

    if (braceIndex === -1 || line.includes('\\begin{') || /[A-Za-z\\]\s*$/.test(beforeBrace)) {
      out.push(line);
      continue;
    }

    const prefix = beforeBrace.trimEnd();
    const collected = [];
    let suffix = '';
    let hasInlineSuffix = false;
    const afterBrace = line.slice(braceIndex + 1).replace(/^\s*{+/, '').replace(/}+[\s]*$/, '').trim();
    if (afterBrace) {
      const split = splitInlineCaseSuffix(afterBrace);
      if (split.math) collected.push(split.math);
      if (split.suffix) {
        suffix = split.suffix;
        hasInlineSuffix = true;
      }
    }

    let j = i + 1;
    for (; !hasInlineSuffix && j < lines.length; j++) {
      const candidate = lines[j].trim();
      if (!candidate) continue;

      const close = candidate.match(/^}\s*(.*)$/);
      if (close) {
        suffix = close[1]?.trim() || '';
        j++;
        break;
      }

      if (!isCaseMathCandidate(candidate)) {
        suffix = candidate;
        j++;
        break;
      }

      collected.push(candidate);
    }

    const cases = buildCasesFromText(collected.join('\n'));
    if (!cases) {
      out.push(line);
      continue;
    }

    out.push([prefix, cases, suffix].filter(Boolean).join(' '));
    i = j - 1;
  }

  return out.join('\n');
}

function maybeBuildCases(input) {
  if (input.includes('\\begin{cases}') || /[\u3400-\u9fff]/.test(input)) return '';
  if (!input.trim().startsWith('{')) return '';
  return buildCasesFromText(input);
}

function repairCaseRows(input) {
  return input.replace(/(\\begin\{cases\})([\s\S]*?)(\\end\{cases\})/g, (_, open, body, close) => {
    const repaired = String(body).replace(
      /(&=\s*[+-]?(?:\d+(?:\.\d+)?|[A-Za-z](?:_\{?\d+\}?)?))\s+(?=[A-Za-z][^&=]*&=)/g,
      '$1 \\\\ ',
    );
    return `${open}${repaired}${close}`;
  });
}

export function normalizeOcrMathText(input) {
  const cleaned = cleanOcrMathInput(input);
  if (!cleaned) return '';

  const enhanced = applyOcrMathRules(cleaned);
  const withCases = repairCaseRows(replaceBraceCaseBlocks(enhanced));
  const cases = maybeBuildCases(withCases);
  if (cases) return cases;

  return repairCaseRows(wrapCommandMath(normalizeRichMathText(withCases)));
}
