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
  if (/^co\d+$/.test(key)) return true;
  if (['timestamp', 'email', 'emailaddress', 'batch', 'grade'].includes(key)) return true;
  return false;
}

function isAbsentMark(value) {
  const s = cellStr(value).toUpperCase();
  return s === 'A' || s === 'AB' || s === 'NA' || s === '-' || s === 'ABSENT';
}

function cellNumber(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const s = cellStr(value);
  const m = s.match(/^=?\s*(\d+(?:\.\d+)?)\s*$/);
  if (m) return Number(m[1]);
  const n = Number(s);
  return Number.isNaN(n) ? null : n;
}

function normalizeQuestionHeader(value) {
  return cellStr(value).replace(/\s*\([^)]*\)\s*$/, '').trim().toLowerCase();
}

function nonEmptyRows(aoa) {
  return (aoa || []).filter((row) => (row || []).some((cell) => cellStr(cell) !== ''));
}

const SHEET_HINTS = {
  T1: ['t1', 'exam t1', 'exam: t1'],
  T2: ['t2', 'exam t2', 'exam: t2'],
  T3: ['t3', 'exam t3', 'exam: t3'],
  TA: ['ta', 'ta marks', 'assignment', 'project'],
  FEEDBACK: ['course exit feedback', 'exit feedback', 'feedback', '[1]exit feedback'],
  roster: ['t1', 'roster', 'students'],
};

function pickSheetName(sheetNames, hints) {
  const names = sheetNames || [];
  const lowered = names.map((n) => n.trim().toLowerCase());
  for (const hint of hints || []) {
    const h = hint.trim().toLowerCase();
    const exact = lowered.findIndex((n) => n === h);
    if (exact >= 0) return names[exact];
    const part = lowered.findIndex((n) => n.includes(h) || h.includes(n));
    if (part >= 0) return names[part];
  }
  return names[0] || null;
}

export async function readSpreadsheetRows(file, options = {}) {
  const name = (file?.name || '').toLowerCase();
  let workbook;
  if (name.endsWith('.csv') || name.endsWith('.txt')) {
    const text = await file.text();
    workbook = XLSX.read(text, { type: 'string' });
  } else {
    const buf = await file.arrayBuffer();
    workbook = XLSX.read(buf, { type: 'array' });
  }
  const hints = options.sheetHints || SHEET_HINTS[options.tab] || [];
  const sheetName = pickSheetName(workbook.SheetNames, hints);
  const sheet = workbook.Sheets[sheetName];
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
      if (/^no\.?\s*of students/i.test(name) || /scored\s*>?\s*=?\s*target/i.test(name)) break;
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

export function parseExamMetaFromRows(aoa) {
  const rows = aoa || [];
  let target_percent = null;
  let total_students = null;
  let appeared = null;
  for (const row of rows) {
    const cells = row || [];
    for (let i = 0; i < cells.length; i += 1) {
      const label = cellStr(cells[i]).toLowerCase().replace(/\s+/g, ' ');
      const nextNum = () => {
        for (let j = i + 1; j < cells.length; j += 1) {
          const n = cellNumber(cells[j]);
          if (n != null) return n;
        }
        return null;
      };
      if (label.includes('total students')) {
        const n = nextNum();
        if (n != null) total_students = n;
      }
      if (label.includes('students appeared') || label === 'no. of students appeared') {
        const n = nextNum();
        if (n != null) appeared = n;
      }
      const m = cellStr(cells[i]).match(/^>=\s*(\d+)\s*%?$/);
      if (m) target_percent = Number(m[1]);
    }
  }
  return { target_percent, total_students, appeared };
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
      if (raw == null || raw === '' || isAbsentMark(raw)) return;
      const num = Number(raw);
      if (Number.isNaN(num)) return;
      marks[q.id] = typeof raw === 'number' ? String(raw) : String(raw).trim();
    });
    marksByEnrol[key] = marks;
  }

  return {
    students,
    marksByEnrol,
    unmatchedColumns: leftoverCols.map((c) => cellStr(header.headers[c])),
  };
}
