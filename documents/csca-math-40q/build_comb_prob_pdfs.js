const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const katex = require('./katex.min.js');

const cssPath = path.join(__dirname, 'katex.min.css');
let katexCss = '';
if (fs.existsSync(cssPath)) {
    katexCss = fs.readFileSync(cssPath, 'utf8');
}
katexCss = katexCss.replace(/url\(fonts\//g, 'url(https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/fonts/');

function convertMarkdownToHtml(mdContent, isSolution = false) {
    const mathMap = new Map();
    let mathCounter = 0;

    // 1. Replace display math $$...$$
    let md = mdContent.replace(/\$\$([\s\S]+?)\$\$/g, (match, formula) => {
        const key = `@@MATH_DISPLAY_${mathCounter++}@@`;
        const rendered = katex.renderToString(formula.trim(), { displayMode: true, throwOnError: false });
        mathMap.set(key, rendered);
        return key;
    });

    // 2. Replace inline math $...$
    md = md.replace(/\$([^\$\n]+?)\$/g, (match, formula) => {
        const key = `@@MATH_INLINE_${mathCounter++}@@`;
        const rendered = katex.renderToString(formula.trim(), { displayMode: false, throwOnError: false });
        mathMap.set(key, rendered);
        return key;
    });

    function formatInline(text) {
        text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
        text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
        return text;
    }

    function restoreMath(text) {
        return text.replace(/@@MATH_(DISPLAY|INLINE)_\d+@@/g, (match) => {
            return mathMap.get(match) || match;
        });
    }

    function renderTable(rows) {
        if (rows.length < 2) return '';
        let out = '<div class="table-container"><table>\n';
        const headers = rows[0].split('|').slice(1, -1).map(h => h.trim());
        out += '<thead><tr>\n';
        for (const h of headers) {
            out += `<th>${restoreMath(formatInline(h))}</th>\n`;
        }
        out += '</tr></thead>\n<tbody>\n';

        for (let i = 2; i < rows.length; i++) {
            const cells = rows[i].split('|').slice(1, -1).map(c => c.trim());
            out += '<tr>\n';
            for (const c of cells) {
                out += `<td>${restoreMath(formatInline(c))}</td>\n`;
            }
            out += '</tr>\n';
        }
        out += '</tbody></table></div>\n';
        return out;
    }

    const lines = md.split('\n');
    let html = '';
    let inTable = false;
    let tableRows = [];
    let inCard = false;
    let inOptions = false;

    function closeOptions() {
        if (inOptions) {
            html += '</div>\n';
            inOptions = false;
        }
    }

    function closeCard() {
        closeOptions();
        if (inCard) {
            html += '</div>\n';
            inCard = false;
        }
    }

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();

        if (line.startsWith('|') && line.endsWith('|')) {
            closeCard();
            if (!inTable) {
                inTable = true;
                tableRows = [];
            }
            tableRows.push(line);
            continue;
        } else if (inTable) {
            html += renderTable(tableRows);
            inTable = false;
            tableRows = [];
        }

        if (line === '---') {
            closeCard();
            html += '<hr/>\n';
            continue;
        }

        if (line.startsWith('# ')) {
            closeCard();
            html += `<h1 class="doc-title">${restoreMath(line.slice(2))}</h1>\n`;
            continue;
        }
        if (line.startsWith('## ')) {
            closeCard();
            html += `<h2 class="doc-section">${restoreMath(line.slice(3))}</h2>\n`;
            continue;
        }
        if (line.startsWith('### MỨC ĐỘ') || line.startsWith('### PHIẾU TÔ')) {
            closeCard();
            html += `<h3 class="doc-subsection">${restoreMath(line.slice(4))}</h3>\n`;
            continue;
        }
        if (line.startsWith('### Câu ')) {
            closeCard();
            inCard = true;
            html += `<div class="solution-card">\n<h4 class="sol-title">Lời giải ${line.slice(4)}</h4>\n`;
            continue;
        }

        if (/^\*\*Câu\s+\d+\.\*\*/.test(line)) {
            closeCard();
            inCard = true;
            html += `<div class="question-card">\n<p class="question-title">${restoreMath(formatInline(line))}</p>\n`;
            continue;
        }

        if (line.startsWith('- **Phân tích bẫy:**')) {
            closeOptions();
            html += `<div class="trap-box"><strong>⚠️ Phân tích bẫy:</strong> ${restoreMath(formatInline(line.replace('- **Phân tích bẫy:**', '').trim()))}</div>\n`;
            continue;
        }
        if (line.startsWith('- **Chọn ')) {
            closeOptions();
            html += `<div class="answer-box"><strong>👉 Kết luận:</strong> ${restoreMath(formatInline(line.replace('- **', '').replace('**', '').trim()))}</div>\n`;
            continue;
        }

        if (/^[A-D]\.\s/.test(line)) {
            if (!inOptions) {
                inOptions = true;
                html += '<div class="options-grid">\n';
            }
            html += `<div class="option-item"><span class="opt-label">${line.slice(0, 2)}</span> <span class="opt-content">${restoreMath(formatInline(line.slice(3)))}</span></div>\n`;
            continue;
        } else {
            closeOptions();
        }

        if (line.startsWith('- ')) {
            html += `<p class="bullet-item">• ${restoreMath(formatInline(line.slice(2)))}</p>\n`;
            continue;
        }

        if (line.length > 0) {
            html += `<p class="normal-p">${restoreMath(formatInline(line))}</p>\n`;
        }
    }

    if (inTable) {
        html += renderTable(tableRows);
    }
    closeCard();

    const title = isSolution ? 'CSCA Math Practice - Combinatorics & Probability Solutions' : 'CSCA Math Practice - Combinatorics & Probability Examination Paper';

    return `<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="utf-8">
    <title>${title}</title>
    <style>
        ${katexCss}

        @page {
            size: A4;
            margin: 12mm 11mm 12mm 11mm;
            @bottom-right {
                content: counter(page);
            }
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            font-size: 9.2pt;
            line-height: 1.4;
            color: #1a1a1a;
            margin: 0;
            padding: 0;
        }

        .doc-title {
            font-size: 14.5pt;
            font-weight: 700;
            text-align: center;
            color: #0b3a75;
            margin: 0 0 2px 0;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .doc-section {
            font-size: 11pt;
            font-weight: 700;
            color: #b32d00;
            border-bottom: 2px solid #b32d00;
            padding-bottom: 2px;
            margin-top: 12px;
            margin-bottom: 6px;
            page-break-after: avoid;
        }

        .doc-subsection {
            font-size: 9.5pt;
            font-weight: 700;
            color: #1a5276;
            margin-top: 8px;
            margin-bottom: 4px;
            page-break-after: avoid;
        }

        hr {
            border: 0;
            border-top: 1px dashed #ccc;
            margin: 8px 0;
        }

        .question-card {
            margin-bottom: 6px;
            page-break-inside: avoid;
            background-color: #fbfcfd;
            border-left: 3px solid #2980b9;
            padding: 3px 6px 4px 6px;
            border-radius: 0 3px 3px 0;
        }

        .question-title {
            margin: 0 0 2px 0;
            font-size: 9.2pt;
            font-weight: 600;
            color: #2c3e50;
        }

        .options-grid {
            display: flex;
            flex-wrap: wrap;
            margin: 1px 0 0 0;
        }

        .option-item {
            flex: 0 0 50%;
            box-sizing: border-box;
            padding: 1px 4px 1px 6px;
            font-size: 8.8pt;
            display: flex;
            align-items: baseline;
        }

        .opt-label {
            font-weight: bold;
            color: #0b3a75;
            margin-right: 5px;
        }

        .opt-content {
            flex: 1;
        }

        .solution-card {
            margin-bottom: 8px;
            page-break-inside: avoid;
            background-color: #fafbfc;
            border-left: 3px solid #16a085;
            padding: 5px 8px;
            border-radius: 0 3px 3px 0;
        }

        .sol-title {
            margin: 0 0 3px 0;
            font-size: 9.5pt;
            font-weight: 700;
            color: #16a085;
        }

        .trap-box {
            background-color: #fff9e6;
            border-left: 3px solid #f39c12;
            padding: 4px 8px;
            margin: 3px 0;
            border-radius: 0 3px 3px 0;
            font-size: 9pt;
            color: #7d5a00;
        }

        .answer-box {
            background-color: #eafaf1;
            border-left: 3px solid #27ae60;
            padding: 3px 8px;
            margin: 3px 0;
            border-radius: 0 3px 3px 0;
            font-size: 9pt;
            color: #145a32;
        }

        .bullet-item {
            margin: 2px 0 2px 6px;
            font-size: 9pt;
        }

        .normal-p {
            margin: 2px 0;
            font-size: 9pt;
        }

        .table-container {
            margin: 8px 0;
            page-break-inside: avoid;
        }

        table {
            width: 100%;
            border-collapse: collapse;
            font-size: 8.5pt;
            text-align: center;
        }

        table, th, td {
            border: 1px solid #bdc3c7;
        }

        th {
            background-color: #2980b9;
            color: white;
            padding: 4px 2px;
            font-weight: 600;
        }

        td {
            padding: 3px 2px;
            background-color: #fff;
        }

        tr:nth-child(even) td {
            background-color: #f7f9fa;
        }

        .katex {
            font-size: 1.05em !important;
        }

        .katex-html {
            white-space: normal;
        }
    </style>
</head>
<body>
${html}
</body>
</html>`;
}

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

// 1. Process Questions
const qMdPath = path.join(__dirname, 'CSCA_Math_Combinatorics_Probability_40Q_Questions.md');
const qHtmlPath = path.join(__dirname, 'CSCA_Math_Combinatorics_Probability_40Q_Questions.html');
const qPdfPath = path.join(__dirname, 'CSCA_Math_Combinatorics_Probability_40Q_Questions.pdf');

const qMd = fs.readFileSync(qMdPath, 'utf8');
const qHtml = convertMarkdownToHtml(qMd, false);
fs.writeFileSync(qHtmlPath, qHtml, 'utf8');
console.log('Building Combinatorics & Probability Questions PDF...');
execSync(`"${chromePath}" --headless=new --disable-gpu --no-pdf-header-footer --print-to-pdf="${qPdfPath}" "${qHtmlPath}"`);
console.log('Questions PDF created:', qPdfPath);

// 2. Process Solutions
const sMdPath = path.join(__dirname, 'CSCA_Math_Combinatorics_Probability_40Q_Solutions.md');
const sHtmlPath = path.join(__dirname, 'CSCA_Math_Combinatorics_Probability_40Q_Solutions.html');
const sPdfPath = path.join(__dirname, 'CSCA_Math_Combinatorics_Probability_40Q_Solutions.pdf');

const sMd = fs.readFileSync(sMdPath, 'utf8');
const sHtml = convertMarkdownToHtml(sMd, true);
fs.writeFileSync(sHtmlPath, sHtml, 'utf8');
console.log('Building Combinatorics & Probability Solutions PDF...');
execSync(`"${chromePath}" --headless=new --disable-gpu --no-pdf-header-footer --print-to-pdf="${sPdfPath}" "${sHtmlPath}"`);
console.log('Solutions PDF created:', sPdfPath);
