# OBE Management System

Standalone web platform for **Outcome-Based Education** course offerings: Course Description, Opening Report, Assessment Tools, Students & Marks, and CO/PO/PSO attainment.

This system is **independent**. It has its own UI, APIs, authentication, and database. It does not connect to or share data with any other OBE project.

```
React (Vite + Tailwind)  →  Django REST + JWT  →  PostgreSQL (Neon)
```

## Roles

| Role | Access |
|------|--------|
| **ADMIN** | All courses, user management (create faculty/admin accounts) |
| **FACULTY** | Only their own course offerings |

A course offering is unique per **`(course_code, academic_year, faculty)`**. The same subject in a new session is a new Course row.

## What the app does

### Course Description
Faculty enter and save syllabus data, then preview / print / save as PDF:

- Header (title, institute), basic info (code, name, program, department, semester, session, NBA code)
- Coordinator names, course outcomes (COs) and cognitive levels
- Lecture-wise breakup, evaluation criteria, PBL, textbooks / reference books
- CO–PO–PSO mapping (level 0–3 + justification). PO/PSO counts are editable (e.g. B.Tech vs M.Tech)

COs and mapping live on the Course. Other documents **read** this data; they do not duplicate it.

### Opening Report
Synced from Course Description (header, COs, mapping). Faculty fill report-only fields:

- Gaps / modifications in syllabus (or NIL)
- Previous-year CO attainment (loaded from historical records, not invented)
- **Target attainment** per CO (faculty-set; optional suggested average from loaded years)
- Actions to improve CO attainment; Strengthens POs/PSOs from mapping (`level > 0`)
- Teaching methods, weak/bright strategies, evaluation strategy, appendix (guidelines, efforts, impact)

Preview and **Print / Save as PDF** use the same document layout as Course Description.

Historical attainment is keyed by **`course_code + academic_year + semester + co_code`**, not the current Course PK, so last year’s offering still applies.

### Assessment Tools
Header fields come from Course Description (programme, year, Odd/Even, course, NBA code, coordinator). Faculty add tools (T-1, T-2, T-3 / mid-sem / end-sem) and questions. Selecting a CO fills the question’s Bloom level from that CO; faculty can override and add remarks. Saved on this offering only.

### Students & Marks
Shared roster for T1, T2, T3, TA / Project, and CO Feedback. Faculty (and admin on the same page) can:

- Add students one-by-one, paste `enrol, name` lines, or **Upload Excel** (`.xlsx` / `.xls` / `.csv`)
- Excel roster order is kept as S.No; **Remove** still works on every row
- Enter marks in the grid, or **Upload Excel** on each exam tab (Enrol No, Name, Q1, Q2, …). Cells stay editable after upload
- Each exam tab shows that exam’s CO summary; the **Attainment** sub-tab under Students & Marks is the overall CO / PO-PSO picture (Direct, Indirect, Final, charts)

Roster/marks Excel is parsed in the **frontend** (`xlsx`). Catalog seed Excel still uses backend `openpyxl`.

CO/PO formulas (on that Attainment sub-tab):

- Direct = 60% tests (T1/T2/T3) + 20% assignment  
- Indirect = 20% course-exit feedback  
- Final = direct + indirect; level 0–3 from percentage  
- PO/PSO attainment from CO attainment × mapping strength  

### Also included
- **Assessment Tools** document (question ↔ CO mapping, stored per offering)
- Dashboard
- Admin user management  

## Folder structure

```
obe-part2/
├── backend/
│   ├── manage.py
│   ├── requirements.txt
│   ├── .env.example
│   ├── obe_backend/              # settings, URLs, dashboard
│   ├── users/                    # JWT auth, ADMIN | FACULTY
│   ├── courses/                  # Course, COs, mapping, modules, books
│   ├── assessments/              # Assessment, Student (sort_order), StudentMark, bulk roster API
│   ├── attainments/              # CO/PO calculation + HistoricalCoAttainment
│   ├── opening_reports/          # OpeningReport (OneToOne Course)
│   └── assessment_tools/         # Assessment Tools document (OneToOne Course)
├── frontend/
│   └── src/
│       ├── api/client.js         # axios + JWT refresh
│       ├── context/AuthContext.jsx
│       ├── components/           # Navbar, CourseSubnav, ProtectedRoute
│       └── pages/                # Login, Courses, Course Description,
│                                 # Opening Report, Assessment Tools, Marks, …
└── README.md
```

## API (prefix `/api`)

| Area | Path |
|------|------|
| Auth / users | `/auth/` |
| Dashboard | `/dashboard/` |
| Courses, COs, mappings | `/courses/` |
| Sessions / NBA catalog / faculty directory | `/courses/sessions/`, `/courses/catalog/`, `/courses/faculty-directory/` |
| Opening report | `/opening-reports/<course_id>/` |
| Assessment tools | `/assessment-tools/<course_id>/` |
| Assessments, students, marks | `/assessments/` |
| Bulk roster import (Excel order) | `POST /assessments/students/bulk/` |
| CO/PO attainment + calculate | `/attainments/` |
| Historical CO attainment | `/attainments/historical/?course=&academic_year=` |

## First-time setup

### 1. Database
Use **PostgreSQL** (Neon is configured via `DATABASE_URL`). Create a dedicated database for this project.

### 2. Backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate              # macOS/Linux: source venv/bin/activate
pip install -r requirements.txt
copy .env.example .env             # set DATABASE_URL, SECRET_KEY
python manage.py migrate           # includes student sort_order for Excel roster sequence
python manage.py createsuperuser   # first Admin
python manage.py runserver         # http://localhost:8000
```

### 3. Frontend

```bash
cd frontend
npm install                        # includes xlsx for roster/marks Excel upload
copy .env.example .env             # default: http://localhost:8000/api
npm run dev                        # http://localhost:5173
```

Sign in at `http://localhost:5173`. Faculty accounts are created by an Admin on **Users**.

## Typical course workflow

1. **Admin → Catalog** — add session (e.g. 2026 Odd), NBA subjects, faculty (Sector-62 / 128). Seed Excel with `python manage.py seed_catalog`.  
2. **Courses** — pick session, NBA subject (program/code/name auto-fill), faculty name, course coordinator; Save.  
3. **Course Description** — fill COs, mapping, syllabus; Save; Print if needed.  
4. **Opening Report** — confirm synced CD data; set targets; Save; Print.  
5. **Assessment Tools** — add T-1 / T-2 / T-3 (or mid/end sem) and questions; Save; Print.  
6. **Students & Marks** — roster + marks (manual or **Upload Excel**). Per-exam CO summary is on T1/T2/T3/TA/Feedback; overall CO/PO-PSO is the Attainment sub-tab. Recalculate there.

Print / Save as PDF uses the browser print dialog (A4). Choose “Save as PDF” as the destination.

## Environment

**Backend `.env`** (see `backend/.env.example`):

- `SECRET_KEY`, `DEBUG`  
- `DATABASE_URL` — Neon Postgres  
- `CORS_ALLOWED_ORIGINS` — e.g. `http://localhost:5173`  

**Frontend `.env`:** `VITE_API_BASE_URL=http://localhost:8000/api`
