"""
Attainment engine matching the Lecture-wise Attainment Sheet HTML template:

  per exam/CO: % of *appeared* students whose marks on that CO's questions are
  all numeric and whose % of max >= target
  level: 0 (<60), 1 (>=60), 2 (>=70), 3 (>=80)
  T-AVG = mean(T1, T2, T3 levels)
  Direct = 0.6 * T-AVG + 0.2 * TA level  (or 0.8 * T-AVG if no TA)
  Indirect = Feedback level
  Final = Direct + 0.2 * Indirect
  PO = Σ(final × mapping) / Σ(mapping)   (blank mapping ignored)
"""
from math import ceil
from decimal import Decimal, ROUND_HALF_UP
from collections import defaultdict
from courses.models import Course, CourseOutcome, CoPoMapping
from assessments.models import Assessment, Student, StudentMark, GradeBand, SHEET_TYPES
from .models import Attainment, ProgramAttainment


def level_from_percentage(pct):
    if pct is None:
        return None
    if pct >= 80:
        return 3
    if pct >= 70:
        return 2
    if pct >= 60:
        return 1
    return 0


def _dec(value, places=2):
    if value is None:
        return None
    return Decimal(str(value)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)


def _f(value, places=2):
    d = _dec(value, places)
    return float(d) if d is not None else None


def _block_for_type(course_id, typ):
    return Assessment.objects.filter(course_id=course_id, assessment_type=typ).order_by('id').first()


def _questions_for_co(questions, course_outcome):
    """Prefer columns whose label/key contains the CO code (Feedback sheet); else FK mapping."""
    code = (course_outcome.co_code or '').strip().lower()
    if code:
        by_label = [
            q for q in questions
            if code in f'{q.label or ""} {q.key or ""}'.lower()
        ]
        if by_label:
            return by_label
    return [q for q in questions if q.course_outcome_id == course_outcome.id]


def _marks_index(course_id):
    """{(assessment_id, student_id, question_id): Decimal}"""
    idx = {}
    qs = StudentMark.objects.filter(assessment__course_id=course_id).values(
        'assessment_id', 'student_id', 'question_id', 'marks_obtained',
    )
    for row in qs:
        if row['question_id'] is None:
            continue
        idx[(row['assessment_id'], row['student_id'], row['question_id'])] = row['marks_obtained']
    return idx


def _students_with_marks(assessment_id, marks_idx):
    sids = set()
    for (aid, sid, _qid), val in marks_idx.items():
        if aid == assessment_id and val is not None:
            sids.add(sid)
    return sids


def _effective_counts(assessment, roster_n, marks_idx):
    total = assessment.total_students or roster_n
    if assessment.appeared:
        appeared = assessment.appeared
    else:
        appeared = len(_students_with_marks(assessment.id, marks_idx))
        if appeared <= 0:
            appeared = roster_n
    return int(total or 0), int(appeared or 0)


def compute_co_stats(assessment, course_outcome, marks_idx=None, roster_n=0, questions=None):
    if assessment is None:
        return None
    questions = list(questions if questions is not None else assessment.questions.all())
    qs = _questions_for_co(questions, course_outcome)
    if not qs:
        return None
    max_sum = sum((q.max_marks or 0) for q in qs)
    if max_sum <= 0:
        return None
    if marks_idx is None:
        marks_idx = _marks_index(assessment.course_id)
    student_ids = {sid for (aid, sid, _qid) in marks_idx if aid == assessment.id}
    count_at_target = 0
    for sid in student_ids:
        total = Decimal('0')
        all_numeric = True
        any_entered = False
        for q in qs:
            val = marks_idx.get((assessment.id, sid, q.id))
            if val is None:
                all_numeric = False
                continue
            total += Decimal(val)
            any_entered = True
        if all_numeric and any_entered:
            pct = (total / Decimal(max_sum)) * 100
            if pct >= assessment.target_percent:
                count_at_target += 1
    _total, appeared = _effective_counts(assessment, roster_n, marks_idx)
    if appeared <= 0:
        return {
            'count_at_target': count_at_target,
            'pct_at_target': 0.0,
            'level': 0,
            'appeared': 0,
            'total': _total,
        }
    pct_at_target = (Decimal(count_at_target) / Decimal(appeared)) * 100
    if assessment.use_ceiling:
        pct_at_target = Decimal(ceil(float(pct_at_target)))
    return {
        'count_at_target': count_at_target,
        'pct_at_target': _f(pct_at_target),
        'level': level_from_percentage(pct_at_target),
        'appeared': appeared,
        'total': _total,
    }


def compute_attainment_row(course_id, course_outcome, marks_idx=None, roster_n=0, blocks=None, questions_by_a=None):
    if blocks is None:
        blocks = {
            typ: _block_for_type(course_id, typ)
            for typ in SHEET_TYPES
        }
    if marks_idx is None:
        marks_idx = _marks_index(course_id)
    t1 = compute_co_stats(blocks.get('T1'), course_outcome, marks_idx, roster_n, (questions_by_a or {}).get(blocks['T1'].id) if blocks.get('T1') else None)
    t2 = compute_co_stats(blocks.get('T2'), course_outcome, marks_idx, roster_n, (questions_by_a or {}).get(blocks['T2'].id) if blocks.get('T2') else None)
    t3 = compute_co_stats(blocks.get('T3'), course_outcome, marks_idx, roster_n, (questions_by_a or {}).get(blocks['T3'].id) if blocks.get('T3') else None)
    ta = compute_co_stats(blocks.get('TA'), course_outcome, marks_idx, roster_n, (questions_by_a or {}).get(blocks['TA'].id) if blocks.get('TA') else None)
    fb = compute_co_stats(blocks.get('FEEDBACK'), course_outcome, marks_idx, roster_n, (questions_by_a or {}).get(blocks['FEEDBACK'].id) if blocks.get('FEEDBACK') else None)

    t_levels = [x['level'] for x in (t1, t2, t3) if x and x['level'] is not None]
    t_avg = (sum(t_levels) / len(t_levels)) if t_levels else None
    assgn = ta['level'] if ta else None
    direct = None
    if t_avg is not None:
        direct = (0.6 * t_avg + 0.2 * assgn) if assgn is not None else (0.8 * t_avg)
    indirect = fb['level'] if fb else None
    final = (direct + 0.2 * (indirect or 0)) if direct is not None else None
    cie_vals = [x for x in (
        t1['level'] if t1 else None,
        t2['level'] if t2 else None,
        assgn,
    ) if x is not None]
    cie = (sum(cie_vals) / len(cie_vals)) if cie_vals else None
    sie = t3['level'] if t3 else None
    return {
        't1': t1, 't2': t2, 't3': t3, 'ta': ta, 'fb': fb,
        't_avg': t_avg, 'assgn_level': assgn, 'direct': direct,
        'indirect': indirect, 'final': final, 'cie': cie, 'sie': sie,
    }


def calculate_for_course_outcome(course_outcome: CourseOutcome) -> Attainment:
    roster_n = Student.objects.filter(course_id=course_outcome.course_id).count()
    row = compute_attainment_row(course_outcome.course_id, course_outcome, roster_n=roster_n)
    final = _dec(row['final'])
    level = None
    if final is not None:
        level = min(3, max(0, int((final + Decimal('0.5')).to_integral_value())))
    breakdown = {
        't1_level': row['t1']['level'] if row['t1'] else None,
        't2_level': row['t2']['level'] if row['t2'] else None,
        't3_level': row['t3']['level'] if row['t3'] else None,
        'ta_level': row['assgn_level'],
        't_avg': row['t_avg'],
        'direct': row['direct'],
        'indirect': row['indirect'],
        'cie': row['cie'],
        'sie': row['sie'],
        't1': row['t1'],
        't2': row['t2'],
        't3': row['t3'],
        'ta': row['ta'],
        'fb': row['fb'],
    }
    attainment, _ = Attainment.objects.update_or_create(
        course_outcome=course_outcome,
        defaults={
            'course': course_outcome.course,
            'direct_attainment': _dec(row['direct']),
            'indirect_attainment': _dec(row['indirect']),
            'final_attainment': final,
            'attainment_level': level,
            'breakdown': breakdown,
        },
    )
    return attainment


def calculate_for_course(course_id):
    outcomes = CourseOutcome.objects.filter(course_id=course_id)
    co_results = [calculate_for_course_outcome(co) for co in outcomes]
    po_results = calculate_program_attainments(course_id)
    return co_results, po_results


def calculate_program_attainments(course_id):
    try:
        course = Course.objects.get(pk=course_id)
    except Course.DoesNotExist:
        return []
    keys = course.po_pso_keys()
    ProgramAttainment.objects.filter(course_id=course_id).exclude(po_key__in=keys).delete()
    results = []
    for po_key in keys:
        mappings = CoPoMapping.objects.filter(
            course_outcome__course_id=course_id,
            po_key=po_key,
            level__isnull=False,
        ).select_related('course_outcome')
        weighted = Decimal('0')
        weight = Decimal('0')
        any_map = False
        for mapping in mappings:
            if mapping.level is None:
                continue
            any_map = True
            try:
                att = mapping.course_outcome.attainment
                final_val = att.final_attainment if att.final_attainment is not None else Decimal('0')
            except Attainment.DoesNotExist:
                final_val = Decimal('0')
            level = Decimal(mapping.level)
            weighted += final_val * level
            weight += level
        percentage = (weighted / weight) if weight and any_map else None
        obj, _ = ProgramAttainment.objects.update_or_create(
            course_id=course_id,
            po_key=po_key,
            defaults={
                'percentage': _dec(percentage),
                'attainment_level': level_from_percentage(
                    (percentage * Decimal('100') / Decimal('3')) if percentage is not None and percentage <= 3 else percentage
                ),
            },
        )
        results.append(obj)
    return results


def student_block_total_from_index(assessment, student_id, marks_idx, questions):
    if not assessment:
        return 0
    total = Decimal('0')
    any_mark = False
    for q in questions:
        val = marks_idx.get((assessment.id, student_id, q.id))
        if val is None:
            continue
        total += Decimal(val)
        any_mark = True
    return float(total) if any_mark else 0


def build_sheet(course):
    """Full attainment + result payload for the Students & Marks UI (one marks query)."""
    assessments = list(
        Assessment.objects.filter(course=course, assessment_type__in=SHEET_TYPES)
        .prefetch_related('questions')
        .order_by('id')
    )
    blocks = {}
    for a in assessments:
        if a.assessment_type not in blocks:
            blocks[a.assessment_type] = a
    questions_by_a = {a.id: list(a.questions.all()) for a in blocks.values()}
    outcomes = list(course.outcomes.all().order_by('order', 'id'))
    students = list(course.students.all())
    roster_n = len(students)
    po_keys = course.po_pso_keys()
    marks_idx = _marks_index(course.id)

    mappings_by_co = defaultdict(dict)
    for m in CoPoMapping.objects.filter(course_outcome__course_id=course.id):
        mappings_by_co[m.course_outcome_id][m.po_key] = m.level

    co_rows = []
    for co in outcomes:
        row = compute_attainment_row(
            course.id, co, marks_idx=marks_idx, roster_n=roster_n,
            blocks=blocks, questions_by_a=questions_by_a,
        )
        mappings = mappings_by_co.get(co.id, {})
        co_rows.append({
            'id': co.id,
            'co_code': co.co_code,
            't1_level': row['t1']['level'] if row['t1'] else None,
            't2_level': row['t2']['level'] if row['t2'] else None,
            't3_level': row['t3']['level'] if row['t3'] else None,
            't_avg': _f(row['t_avg']),
            'ta_level': row['assgn_level'],
            'direct': _f(row['direct']),
            'indirect': row['indirect'],
            'final': _f(row['final']),
            'cie': _f(row['cie']),
            'sie': row['sie'] if row['sie'] is None else _f(row['sie']),
            't1': row['t1'],
            't2': row['t2'],
            't3': row['t3'],
            'ta': row['ta'],
            'fb': row['fb'],
            'mappings': mappings,
        })

    po_attainment = {}
    mapping_avg = {}
    for po in po_keys:
        num = den = 0
        map_sum = map_n = 0
        any_map = False
        for row in co_rows:
            lvl = row['mappings'].get(po)
            if lvl is None:
                continue
            any_map = True
            map_sum += lvl
            map_n += 1
            final_val = row['final'] if row['final'] is not None else 0
            num += final_val * lvl
            den += lvl
        po_attainment[po] = _f(num / den) if den and any_map else None
        mapping_avg[po] = _f(map_sum / map_n) if map_n else None

    exam_summaries = []
    for typ in SHEET_TYPES:
        a = blocks.get(typ)
        if not a:
            continue
        qs = questions_by_a.get(a.id, [])
        total, appeared = _effective_counts(a, roster_n, marks_idx)
        co_stats = []
        for co in outcomes:
            stats = compute_co_stats(a, co, marks_idx, roster_n, qs)
            if not stats:
                continue
            co_stats.append({
                'co_code': co.co_code,
                **stats,
            })
        exam_summaries.append({
            'type': typ,
            'label': a.display_label(),
            'target_percent': a.target_percent,
            'total_students': total,
            'appeared': appeared,
            'use_ceiling': a.use_ceiling,
            'cos': co_stats,
        })

    bands = list(course.grade_bands.all().order_by('min_marks', 'id'))
    if not bands:
        bands = [GradeBand(min_marks=m, grade=g) for m, g in (
            (0, 'F'), (30, 'D'), (36, 'C'), (43, 'C+'),
            (50, 'B'), (60, 'B+'), (70, 'A'), (80, 'A+'),
        )]

    def grade_for(total):
        g = bands[0].grade if bands else '—'
        for b in bands:
            if total >= float(b.min_marks):
                g = b.grade
        return g

    t1, t2, t3, ta = blocks.get('T1'), blocks.get('T2'), blocks.get('T3'), blocks.get('TA')
    q1 = questions_by_a.get(t1.id, []) if t1 else []
    q2 = questions_by_a.get(t2.id, []) if t2 else []
    q3 = questions_by_a.get(t3.id, []) if t3 else []
    qa = questions_by_a.get(ta.id, []) if ta else []
    results = []
    dist = {}
    for i, st in enumerate(students):
        tot1 = student_block_total_from_index(t1, st.id, marks_idx, q1)
        tot2 = student_block_total_from_index(t2, st.id, marks_idx, q2)
        tot3 = student_block_total_from_index(t3, st.id, marks_idx, q3)
        tota = student_block_total_from_index(ta, st.id, marks_idx, qa)
        grand = tot1 + tot2 + tot3 + tota
        g = grade_for(grand)
        dist[g] = dist.get(g, 0) + 1
        results.append({
            'sno': i + 1,
            'enrol': st.roll_number,
            'name': st.name,
            't1': tot1, 't2': tot2, 't3': tot3, 'ta': tota,
            'total': round(grand, 1), 'grade': g,
        })
    n = len(students) or 1
    grade_distribution = [
        {
            'grade': b.grade,
            'count': dist.get(b.grade, 0),
            'percent': round(dist.get(b.grade, 0) / n * 100, 1),
        }
        for b in bands
    ]
    return {
        'nba_code': course.nba_code,
        'course_code': course.course_code,
        'course_name': course.course_name,
        'academic_year': course.academic_year,
        'semester': course.semester,
        'roster_count': roster_n,
        'cos': co_rows,
        'po_keys': po_keys,
        'po_attainment': po_attainment,
        'mapping_avg': mapping_avg,
        'exam_summaries': exam_summaries,
        'results': results,
        'grade_distribution': grade_distribution,
    }
