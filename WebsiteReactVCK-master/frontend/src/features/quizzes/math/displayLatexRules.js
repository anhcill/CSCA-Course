const LATEX_COMMANDS = [
  'sin',
  'cos',
  'tan',
  'cot',
  'sec',
  'csc',
  'log',
  'ln',
  'lg',
  'sqrt',
  'lim',
  'sum',
  'int',
  'vec',
  'bar',
  'hat',
  'tilde',
  'frac',
  'dfrac',
  'tfrac',
  'binom',
  'mathbb',
  'mathrm',
  'mathbf',
  'operatorname',
  'text',
  'left',
  'right',
  'infty',
  'emptyset',
  'in',
  'notin',
  'setminus',
  'cup',
  'cap',
  'times',
  'div',
  'cdot',
  'quad',
  'qquad',
  'circ',
  'pi',
  'alpha',
  'beta',
  'gamma',
  'delta',
  'theta',
  'lambda',
  'mu',
  'omega',
  'varphi',
  'phi',
  'Delta',
  'partial',
  'pm',
  'Rightarrow',
  'Leftrightarrow',
  'leftrightarrow',
  'rightarrow',
  'leftarrow',
  'to',
  'leq',
  'geq',
  'neq',
  'le',
  'ge',
  'ne',
  'approx',
];

const LATEX_COMMAND_SOURCE = LATEX_COMMANDS.join('|');
const LATEX_COMMAND_RE = new RegExp(String.raw`\\(?:${LATEX_COMMAND_SOURCE})(?![A-Za-z])`);
const GLUED_COMMAND_RE = new RegExp(String.raw`\\(${LATEX_COMMAND_SOURCE})(?=[A-Za-z])`, 'g');
const PROTECTED_SEGMENT_RE = /(\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]|\$\$[\s\S]*?\$\$|\$[^$\n]*\$|```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/g;
const RELATION_RE = /(?:=|<|>|\\(?:le|leq|ge|geq|ne|neq|approx|Rightarrow|Leftrightarrow|leftrightarrow|rightarrow|leftarrow|to)(?![A-Za-z])|[≤≥≠≈→⇒⇔])/;
const TEXT_LETTER_RE = /[\u00C0-\u1EF9\u4E00-\u9FFF]/;
const MATH_RUN_CHARS_SOURCE = String.raw`[A-Za-z0-9\\{}()[\]\s_^+\-*/=<>.,;:|'"!]+`;
const BARE_OPERATOR_RUN_RE = new RegExp(
  String.raw`(^|[^\\$])(${MATH_RUN_CHARS_SOURCE}\\(?:cup|cap|setminus|infty|mid|geq?|leq?|neq?|to|Rightarrow|Leftrightarrow|cdot|times|div)${MATH_RUN_CHARS_SOURCE})`,
  'g',
);

function splitProtected(value, mapper) {
  return value
    .split(PROTECTED_SEGMENT_RE)
    .map((segment) => {
      if (
        !segment ||
        segment.startsWith('\\(') ||
        segment.startsWith('\\[') ||
        segment.startsWith('$') ||
        segment.startsWith('`') ||
        segment.startsWith('~~~')
      ) {
        return segment;
      }

      return mapper(segment);
    })
    .join('');
}

function normalizeGluedCommands(value) {
  return value.replace(GLUED_COMMAND_RE, (match, command, offset, whole) => {
    const commandText = whole.slice(offset + 1);
    if (
      (command === 'in' && (commandText.startsWith('infty') || commandText.startsWith('int'))) ||
      (command === 'le' && (commandText.startsWith('leq') || commandText.startsWith('left'))) ||
      (command === 'left' && /^left(?:arrow|rightarrow|leftarrows|rightarrows|rightharpoons|threetimes)/.test(commandText)) ||
      (command === 'right' && /^right(?:arrow|rightarrows|leftharpoons|arrowtail|squigarrow)/.test(commandText)) ||
      (command === 'ge' && commandText.startsWith('geq')) ||
      (command === 'ne' && commandText.startsWith('neq'))
    ) {
      return match;
    }

    return `\\${command} `;
  });
}

function stripBrokenDollarsByLine(value) {
  return value
    .split('\n')
    .map((line) => {
      const dollarCount = (line.match(/\$/g) || []).length;
      if (!dollarCount) return line;

      const withoutValidPairs = line.replace(/\$\$[^$\n]+\$\$|\$[^$\n]+\$/g, '');
      const hasBrokenDollar =
        withoutValidPairs.includes('$') ||
        /\\\(\s*\$|\$\s*\\\)/.test(line);
      if (!hasBrokenDollar) return line;

      const withoutDollars = line.replace(/\$/g, '');
      if (!LATEX_COMMAND_RE.test(withoutDollars) && !RELATION_RE.test(withoutDollars)) return line;
      return withoutDollars;
    })
    .join('\n');
}

function repairDollarNoise(value) {
  return stripBrokenDollarsByLine(value
    .replace(/\${3,}/g, '$$')
    .replace(/\\\(\s*\$+([\s\S]{1,260}?)\$+\s*\\\)/g, (_, formula) => `\\(${String(formula).trim()}\\)`)
    .replace(/\$\s*\\\(([\s\S]{1,260}?)\\\)\s*\$/g, (_, formula) => `\\(${String(formula).trim()}\\)`)
    .replace(/([=<>+\-*/:,;([]\s*)\$\$+(?=\s*(?:\\|[A-Za-z0-9()[\]{}+-]))/g, '$1')
    .replace(/(\\(?:Rightarrow|Leftrightarrow|to)\s*)\$\$+(?=\s*[(\\A-Za-z0-9])/g, '$1'));
}

function collapseNestedInlineDelimiters(value) {
  let out = '';
  let inline = false;
  let display = false;
  let nestedInline = 0;
  let nestedDisplay = 0;

  for (let index = 0; index < value.length;) {
    if (value.startsWith('\\(', index)) {
      if (inline || display) {
        nestedInline += 1;
        index += 2;
        continue;
      }
      inline = true;
      out += '\\(';
      index += 2;
      continue;
    }

    if (value.startsWith('\\)', index)) {
      if (nestedInline > 0) {
        nestedInline -= 1;
        index += 2;
        continue;
      }
      inline = false;
      out += '\\)';
      index += 2;
      continue;
    }

    if (value.startsWith('\\[', index)) {
      if (inline || display) {
        nestedDisplay += 1;
        index += 2;
        continue;
      }
      display = true;
      out += '\\[';
      index += 2;
      continue;
    }

    if (value.startsWith('\\]', index)) {
      if (nestedDisplay > 0) {
        nestedDisplay -= 1;
        index += 2;
        continue;
      }
      display = false;
      out += '\\]';
      index += 2;
      continue;
    }

    out += value[index];
    index += 1;
  }

  return out;
}

function stripAnswerPrefix(line) {
  const match = line.match(/^(\s*(?:[A-H](?:\s*(?:解释|解析|解答|答案))?|[A-H][.、．]|(?:选|选择)\s*[A-H])\s*[:：.]?\s*)([\s\S]+)$/i);
  if (!match) return { prefix: '', body: line };
  return { prefix: match[1], body: match[2] };
}

function looksMathOnly(value) {
  const text = value.trim();
  if (!text || text.length > 320) return false;
  if (TEXT_LETTER_RE.test(text)) return false;
  const hasLatexCommand = LATEX_COMMAND_RE.test(text);
  const hasRelation = RELATION_RE.test(text);
  if (!hasLatexCommand && !/[A-Za-z0-9]/.test(text)) return false;
  if (!hasLatexCommand && !hasRelation && /[A-Za-z]{2,}/.test(text)) return false;
  if (!hasLatexCommand && !hasRelation && !/[()[\]{}_^]/.test(text)) return false;
  if (!/[=+\-*/^_<>]|\\(?:frac|sqrt|ln|log|lg|sin|cos|tan|cdot|Rightarrow|Leftrightarrow|to|cup|cap|infty)\b/.test(text)) return false;
  return /^[A-Za-z0-9\\{}()[\]\s_^+\-*/=<>.,;:|'"!]+$/.test(text);
}

function wrapMathOnlyLines(value) {
  return value
    .split('\n')
    .map((line) => {
      if (/\\\[|\\\(|[$`]/.test(line)) return line;
      const { prefix, body } = stripAnswerPrefix(line);
      const leading = body.match(/^\s*/)?.[0] || '';
      const trailing = body.match(/\s*$/)?.[0] || '';
      const core = body.slice(leading.length, body.length - trailing.length);
      if (!looksMathOnly(core)) return line;
      return `${prefix}${leading}\\(${core}\\)${trailing}`;
    })
    .join('\n');
}

function trimMathRun(run) {
  let leading = run.match(/^\s*/)?.[0] || '';
  let trailing = run.match(/[\s,.;:]+$/)?.[0] || '';
  let core = run.slice(leading.length, run.length - trailing.length);
  const firstCommand = core.search(LATEX_COMMAND_RE);
  if (firstCommand > 0) {
    const beforeCommand = core.slice(0, firstCommand);
    const mathStart = beforeCommand.search(/(?:^|\s)([A-Z](?:_\{[^{}]+\})?(?:\s*\([^()]*\))?|[a-z](?:_\{[^{}]+\})?)\s*$/);
    if (mathStart > 0) {
      const dropped = beforeCommand.slice(0, mathStart);
      leading += dropped;
      core = core.slice(mathStart).trimStart();
    }
  }
  const proseSuffix = core.match(/([,.;:]\s*[a-z]{1,32})$/);
  if (proseSuffix && LATEX_COMMAND_RE.test(core.slice(0, proseSuffix.index))) {
    trailing = `${proseSuffix[1]}${trailing}`;
    core = core.slice(0, proseSuffix.index);
  }
  return { leading, core, trailing };
}

function looksOperatorRunMath(value) {
  const text = value.trim();
  if (!text || text.length > 320) return false;
  if (TEXT_LETTER_RE.test(text)) return false;
  if (!LATEX_COMMAND_RE.test(text)) return false;
  if (!RELATION_RE.test(text) && !/\\(?:cup|cap|setminus|mid|infty|cdot|times|div)\b/.test(text)) return false;
  return /^[A-Za-z0-9\\{}()[\]\s_^+\-*/=<>.,;:|'"!]+$/.test(text);
}

function isInsideInlineMath(value, offset) {
  const before = value.slice(0, offset);
  const openInline = before.lastIndexOf('\\(');
  const closeInline = before.lastIndexOf('\\)');
  const openDisplay = before.lastIndexOf('\\[');
  const closeDisplay = before.lastIndexOf('\\]');
  const openDollar = before.lastIndexOf('$');

  if (openInline > closeInline) return true;
  if (openDisplay > closeDisplay) return true;
  if (openDollar >= 0 && before.slice(openDollar + 1).indexOf('$') < 0) return true;
  return false;
}

function wrapBareOperatorRuns(value) {
  return value.replace(BARE_OPERATOR_RUN_RE, (match, prefix, run, offset, whole) => {
    const runOffset = offset + prefix.length;
    if (isInsideInlineMath(whole, runOffset)) return match;
    const { leading, core, trailing } = trimMathRun(run);
    if (!looksOperatorRunMath(core)) return match;
    return `${prefix}${leading}\\(${core}\\)${trailing}`;
  });
}

function wrapStandaloneCommandTokens(value) {
  const tokenPattern = new RegExp(String.raw`\\(?:Rightarrow|Leftrightarrow|to|leq|geq|neq|le|ge|ne|approx|cup|cap|cdot|times|div)\b`, 'g');
  return value.replace(tokenPattern, (match, offset, whole) => {
    if (isInsideInlineMath(whole, offset)) return match;
    return `\\(${match}\\)`;
  });
}

export function applyDisplayLatexInputRules(input) {
  if (!input) return '';

  const repaired = wrapMathOnlyLines(
    collapseNestedInlineDelimiters(
      repairDollarNoise(String(input).replace(/\r\n?/g, '\n').replace(/\u00A0/g, ' ')),
    ),
  );

  return splitProtected(repaired, (segment) => (
    wrapStandaloneCommandTokens(wrapBareOperatorRuns(normalizeGluedCommands(segment)))
  ));
}

export function applyDisplayLatexOutputRules(input) {
  if (!input) return '';

  return collapseNestedInlineDelimiters(repairDollarNoise(input))
    .replace(/\\\)\s*\\\((\\(?:Rightarrow|Leftrightarrow|to|leq|geq|neq|le|ge|ne|approx|cup|cap|cdot|times|div)\b)\\\)\s*\\\(/g, (_, command) => ` ${command} `)
    .replace(/\\\((\\(?:Rightarrow|Leftrightarrow|to|leq|geq|neq|le|ge|ne|approx|cup|cap|cdot|times|div)\b)\\\)/g, '$1');
}
