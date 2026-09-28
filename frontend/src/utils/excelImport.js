import * as XLSX from 'xlsx';

function cellStr(value) {
  if (value == null || value === '') return '';
  return String(value).trim();
}

function cellEnrol(value) {
  if (value == null || value === '') return '';
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }
  return cellStr(value);
}

function headerKey(value) {
  return cellStr(value).toLowerCase().replace(/[.\s_/-]+/g, '');
}

function isSnoHeader(key) {
  return ['sno', 'srno', 'serial', 'serialno', 'slno', 'snumber'].includes(key);
}

function isEnrolHeader(key) {
  return [
    'enrolno', 'enrol', 'enrollno', 'enrollment', 'enrollmentno', 'enrollmentnumber',
    'enrolment', 'enrolmentno', 'roll', 'rollno', 'rollnumber', 'universityroll',
  ].includes(key);
}

function isNameHeader(key) {
  return ['name', 'fullname', 'studentname', 'student', 'studentfullname'].includes(key);
}

function isSkipMarkHeader(key, raw) {
  if (!key) return true;
  if (isSnoHeader(key) || isEnrolHeader(key) || isNameHeader(key)) return true;
  if (key.startsWith('total')) return true;
  if (key.includes('percent') || key.includes('pct')) return true;
  if (/%\s*$/.test(cellStr(raw))) return true;
  return false;
}

function normalizeQuestionHeader(value) {
  return cellStr(value).replace(/\s*\([^)]*\)\s*$/, '').trim().toLowerCase();
}

function nonEmptyRows(aoa) {
  return (aoa || []).filter((row) => (row || []).some((cell) => cellStr(cell) !== ''));
}

export async function readSpreadsheetRows(file) {
  const name = (file?.name || '').toLowerCase();
  let workbook;
  if (name.endsWith('.csv') || name.endsWith('.txt')) {
    const text = await file.text();
    workbook = XLSX.read(text, { type: 'string' });
  } else {
    const buf = await file.arrayBuffer();
    workbook = XLSX.read(buf, { type: 'array' });
  }
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });
}

function detectRosterHeader(rows) {
  const scan = Math.min(rows.length, 12);
  for (let i = 0; i < scan; i += 1) {
    const keys = (rows[i] || []).map((c) => headerKey(c));
    const enrolIdx = keys.findIndex(isEnrolHeader);
    const nameIdx = keys.findIndex(isNameHeader);
    if (enrolIdx >= 0 && nameIdx >= 0) {
      return { headerIndex: i, enrolIdx, nameIdx };
    }
  }
  return null;
}

export function parseRosterFromRows(aoa) {
  const rows = nonEmptyRows(aoa);
  if (!rows.length) return [];
  const header = detectRosterHeader(rows);
  const students = [];
  const seen = new Set();

  if (header) {
    for (let i = header.headerIndex + 1; i < rows.length; i += 1) {
      const row = rows[i] || [];
      const roll_number = cellEnrol(row[header.enrolIdx]);
      const name = cellStr(row[header.nameIdx]);
      const key = roll_number.toLowerCase();
      if (!roll_number || !name || seen.has(key)) continue;
      seen.add(key);
      students.push({ roll_number, name });
    }
    return students;
  }

  for (const row of rows) {
    const cells = (row || []).map((c) => c);
    const first = headerKey(cells[0]);
    if (isSnoHeader(first) || isEnrolHeader(first) || first === 'enrolno') continue;
    let roll_number = '';
    let name = '';
    if (cells.length >= 3 && (typeof cells[0] === 'number' || /^\d+$/.test(cellStr(cells[0])))) {
      roll_number = cellEnrol(cells[1]);
      name = cellStr(cells[2]);
    } else {
      roll_number = cellEnrol(cells[0]);
      name = cellStr(cells[1]);
    }
    const key = roll_number.toLowerCase();
    if (!roll_number || !name || seen.has(key)) continue;
    seen.add(key);
    students.push({ roll_number, name });
  }
  return students;
}

function detectMarksHeader(rows) {
  const scan = Math.min(rows.length, 15);
  for (let i = 0; i < scan; i += 1) {
    const keys = (rows[i] || []).map((c) => headerKey(c));
    const enrolIdx = keys.findIndex(isEnrolHeader);
    const nameIdx = keys.findIndex(isNameHeader);
    if (enrolIdx >= 0) {
      return { headerIndex: i, enrolIdx, nameIdx, headers: rows[i] || [] };
    }
  }
  return null;
}

export function parseMarksFromRows(aoa, questions) {
  const rows = nonEmptyRows(aoa);
  const qs = questions || [];
  if (!rows.length) return { students: [], marksByEnrol: {}, unmatchedColumns: [] };

  const header = detectMarksHeader(rows);
  const marksByEnrol = {};
  const students = [];
  const seen = new Set();

  if (!header) {
    return { students: [], marksByEnrol: {}, unmatchedColumns: [] };
  }

  const usedQuestion = new Set();
  const colToQuestion = new Map();
  (header.headers || []).forEach((raw, col) => {
    if (col === header.enrolIdx || col === header.nameIdx) return;
    const key = headerKey(raw);
    if (isSkipMarkHeader(key, raw)) return;
    const norm = normalizeQuestionHeader(raw);
    const match = qs.find((q, qi) => {
      if (usedQuestion.has(qi)) return false;
      const labels = [q.label, q.key].filter(Boolean).map((x) => normalizeQuestionHeader(x));
      return labels.includes(norm);
    });
    if (match) {
      const qi = qs.indexOf(match);
      usedQuestion.add(qi);
      colToQuestion.set(col, match);
    }
  });

  const leftoverCols = [];
  (header.headers || []).forEach((raw, col) => {
    if (colToQuestion.has(col)) return;
    if (col === header.enrolIdx || col === header.nameIdx) return;
    const key = headerKey(raw);
    if (isSkipMarkHeader(key, raw)) return;
    leftoverCols.push(col);
  });
  qs.forEach((q, qi) => {
    if (usedQuestion.has(qi)) return;
    const col = leftoverCols.shift();
    if (col == null) return;
    colToQuestion.set(col, q);
    usedQuestion.add(qi);
  });

  for (let i = header.headerIndex + 1; i < rows.length; i += 1) {
    const row = rows[i] || [];
    const roll_number = cellEnrol(row[header.enrolIdx]);
    const name = header.nameIdx >= 0 ? cellStr(row[header.nameIdx]) : '';
    if (!roll_number) continue;
    const key = roll_number.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    students.push({ roll_number, name: name || roll_number });
    const marks = {};
    colToQuestion.forEach((q, col) => {
      const raw = row[col];
      if (raw == null || raw === '') return;
      const num = Number(raw);
      if (Number.isNaN(num)) return;
      marks[q.id] = String(raw).trim() === String(num) ? String(num) : String(raw).trim();
      if (typeof raw === 'number') marks[q.id] = String(raw);
    });
    marksByEnrol[key] = marks;
  }

  return {
    students,
    marksByEnrol,
    unmatchedColumns: leftoverCols.map((c) => cellStr(header.headers[c])),
  };
}
