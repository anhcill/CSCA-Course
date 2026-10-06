import assert from "node:assert/strict";
import test from "node:test";
import { makeCsv, makeXlsx } from "./spreadsheetExport.service.js";

test("CSV export preserves Vietnamese text and quotes cells safely", () => {
  const csv = makeCsv([["Học viên", "Ghi chú"], ["Nguyễn An", "Nộp \"đúng hạn\""]]);
  assert.ok(csv.startsWith("\uFEFF"));
  assert.match(csv, /"Nguyễn An"/);
  assert.match(csv, /"Nộp ""đúng hạn"""/);
});

test("CSV neutralizes spreadsheet formulas while retaining numeric grades", () => {
  const csv = makeCsv([['=HYPERLINK("https://example.test")', " +SUM(1,2)", 0, 9.5]]);
  assert.ok(csv.includes("\"'=HYPERLINK"));
  assert.ok(csv.includes("\"' +SUM"));
  assert.ok(csv.includes('\"0\",\"9.5\"'));
});

test("XLSX export creates a zipped Open XML workbook", () => {
  const workbook = makeXlsx([["Học viên", "Điểm"], ["Nguyễn An", 9.5]]);
  assert.ok(Buffer.isBuffer(workbook));
  assert.equal(workbook.readUInt32LE(0), 0x04034B50);
  assert.ok(workbook.includes(Buffer.from("xl/worksheets/sheet1.xml")));
});
