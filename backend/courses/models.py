from django.conf import settings
from django.db import models
import re


def canonical_session_label(academic_year, semester):
    """Normalize 2026-27 + ODD, or 2026 Odd, to '2026 Odd'."""
    odd = str(semester or '').upper() != 'EVEN'
    season = 'Even' if not odd else 'Odd'
    text = (academic_year or '').strip()
    if not text:
        return season
    if re.match(r'^\d{4}\s+(Odd|Even)$', text, re.I):
        year = text[:4]
        return f'{year} {season}'
    match = re.match(r'^(\d{4})', text)
    if match:
        return f'{match.group(1)} {season}'
    return f'{text} {season}'


class AcademicSession(models.Model):
    """Canonical session key for the whole system, e.g. 2026 Odd / 2026 Even."""
    class SemesterType(models.TextChoices):
        ODD = 'ODD', 'Odd'
        EVEN = 'EVEN', 'Even'

    calendar_year = models.PositiveSmallIntegerField()
    semester_type = models.CharField(max_length=6, choices=SemesterType.choices)

    class Meta:
        ordering = ['-calendar_year', 'semester_type']
        constraints = [
            models.UniqueConstraint(
                fields=['calendar_year', 'semester_type'],
                name='unique_academic_session',
            ),
        ]

    def __str__(self):
        return self.label

    @property
    def label(self):
        return f'{self.calendar_year} {self.get_semester_type_display()}'


class FacultyProfile(models.Model):
    """Directory of faculty names used on documents (both campuses)."""
    class Campus(models.TextChoices):
        SECTOR_62 = 'SECTOR_62', 'Sector-62'
        SECTOR_128 = 'SECTOR_128', 'Sector-128'
        UNKNOWN = 'UNKNOWN', 'Not set'

    full_name = models.CharField(max_length=255)
    campus = models.CharField(max_length=16, choices=Campus.choices, default=Campus.UNKNOWN)
    email = models.EmailField(blank=True)
    department = models.CharField(max_length=120, blank=True)
    employee_id = models.CharField(max_length=40, blank=True)
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='faculty_profile',
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['full_name']
        constraints = [
            models.UniqueConstraint(fields=['full_name', 'campus'], name='unique_faculty_name_campus'),
        ]

    def __str__(self):
        return f'{self.full_name} ({self.get_campus_display()})'


def is_lab_subject_name(course_name):
    """True when the catalog/course title looks like a lab subject."""
    text = (course_name or '').strip()
    if not text:
        return False
    return bool(re.search(r'\bLAB\b', text, re.I))


def session_order_key(session):
    """Chronological order: 2026 Odd → 2026 Even → 2027 Odd → …"""
    sem = 0 if session.semester_type == AcademicSession.SemesterType.ODD else 1
    return (session.calendar_year, sem)


class NbaSubjectCatalog(models.Model):
    """Admin master: NBA code + subject for one academic session."""
    session = models.ForeignKey(AcademicSession, on_delete=models.CASCADE, related_name='subjects')
    program_name = models.CharField(max_length=120)
    course_code = models.CharField(max_length=40)
    course_name = models.CharField(max_length=255)
    year_of_study = models.PositiveSmallIntegerField()
    semester_number = models.PositiveSmallIntegerField()
    nba_code = models.CharField(max_length=20)
    credits = models.PositiveSmallIntegerField(null=True, blank=True)

    class Meta:
        ordering = ['session', 'program_name', 'nba_code', 'course_code']
        constraints = [
            models.UniqueConstraint(
                fields=['session', 'nba_code', 'course_code'],
                name='unique_nba_course_per_session',
            ),
        ]

    def __str__(self):
        return f'{self.nba_code} · {self.course_code} ({self.session})'

    @property
    def is_lab(self):
        return is_lab_subject_name(self.course_name)


def previous_session_with_subjects(session):
    """Most recent earlier session that already has NBA catalog rows."""
    key = session_order_key(session)
    prior = [
        s for s in AcademicSession.objects.exclude(pk=session.pk).prefetch_related('subjects')
        if session_order_key(s) < key and s.subjects.exists()
    ]
    if not prior:
        return None
    return max(prior, key=session_order_key)


def copy_catalog_from_previous(session):
    """
    Carry NBA subjects forward into an empty session from the previous one.
    Returns how many rows were created. No-op if the session already has subjects.
    """
    if session.subjects.exists():
        return 0
    source = previous_session_with_subjects(session)
    if not source:
        return 0
    created = 0
    for row in source.subjects.all():
        _, was_created = NbaSubjectCatalog.objects.get_or_create(
            session=session,
            nba_code=row.nba_code,
            course_code=row.course_code,
            defaults={
                'program_name': row.program_name,
                'course_name': row.course_name,
                'year_of_study': row.year_of_study,
                'semester_number': row.semester_number,
                'credits': row.credits,
            },
        )
        if was_created:
            created += 1
    return created


class Course(models.Model):
    """One offering of a subject: unique per faculty + session (academic year)."""
    class Semester(models.TextChoices):
        ODD = 'ODD', 'Odd'
        EVEN = 'EVEN', 'Even'

    class Kind(models.TextChoices):
        THEORY = 'THEORY', 'Theory'
        LAB = 'LAB', 'Lab'

    academic_session = models.ForeignKey(
        AcademicSession, on_delete=models.SET_NULL, null=True, blank=True, related_name='offerings',
    )
    catalog_entry = models.ForeignKey(
        NbaSubjectCatalog, on_delete=models.SET_NULL, null=True, blank=True, related_name='offerings',
    )
    course_kind = models.CharField(max_length=10, choices=Kind.choices, default=Kind.THEORY)
    # Kept in sync with course_kind (DB already had a NOT NULL is_lab column).
    is_lab = models.BooleanField(default=False)
    course_code = models.CharField(max_length=30)
    course_name = models.CharField(max_length=255)
    program_name = models.CharField(max_length=120, blank=True, help_text='e.g. M.Tech CSE, B.Tech CSE')
    department = models.CharField(max_length=255, blank=True, help_text='e.g. Department of CSE & IT')
    nba_code = models.CharField(max_length=20, blank=True)
    year_of_study = models.PositiveSmallIntegerField(null=True, blank=True)
    semester_number = models.PositiveSmallIntegerField(null=True, blank=True)
    semester = models.CharField(max_length=6, choices=Semester.choices)
    academic_year = models.CharField(max_length=20, help_text='Session label, e.g. 2026 Odd')
    credits = models.PositiveSmallIntegerField(default=3)
    faculty = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='courses', limit_choices_to={'role': 'FACULTY'},
    )
    teaching_faculty = models.ForeignKey(
        FacultyProfile, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='taught_offerings',
    )
    course_coordinator = models.ForeignKey(
        FacultyProfile, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='coordinated_offerings',
    )

    doc_title = models.CharField(max_length=255, default='Detailed Syllabus')
    institute = models.CharField(max_length=255, blank=True)
    institute_sub = models.CharField(max_length=255, blank=True)
    logo_fallback = models.CharField(max_length=80, default='LOGO')
    watermark_text = models.CharField(max_length=80, blank=True)
    coordinator_names = models.CharField(max_length=500, blank=True)

    t1_marks = models.PositiveSmallIntegerField(default=20)
    t2_marks = models.PositiveSmallIntegerField(default=20)
    end_sem_marks = models.PositiveSmallIntegerField(default=35)
    ta_marks = models.PositiveSmallIntegerField(default=25)
    pbl = models.TextField(blank=True)
    po_count = models.PositiveSmallIntegerField(default=3)
    pso_count = models.PositiveSmallIntegerField(default=2)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-academic_year', 'course_code']
        constraints = [
            models.UniqueConstraint(
                fields=['course_code', 'academic_year', 'faculty'],
                name='unique_course_per_faculty_session',
            ),
        ]

    def __str__(self):
        return f'{self.course_code} — {self.course_name} ({self.session_label})'

    def save(self, *args, **kwargs):
        self.is_lab = self.course_kind == self.Kind.LAB
        super().save(*args, **kwargs)

    @property
    def session_label(self):
        if self.academic_session_id:
            return self.academic_session.label
        return canonical_session_label(self.academic_year, self.semester)

    @property
    def teaching_faculty_display(self):
        if self.teaching_faculty_id:
            return self.teaching_faculty.full_name
        if self.faculty_id:
            return self.faculty.get_full_name() or self.faculty.username
        return ''

    @property
    def coordinator_display(self):
        if self.course_coordinator_id:
            return self.course_coordinator.full_name
        return self.coordinator_names or self.teaching_faculty_display

    @property
    def eval_total(self):
        return (self.t1_marks or 0) + (self.t2_marks or 0) + (self.end_sem_marks or 0) + (self.ta_marks or 0)

    def po_pso_keys(self):
        keys = [f'PO{i}' for i in range(1, (self.po_count or 0) + 1)]
        keys += [f'PSO{i}' for i in range(1, (self.pso_count or 0) + 1)]
        return keys


class CourseOutcome(models.Model):
    """SRS 'Course Outcomes' table: CO_ID · Course_ID · CO_Code · Description · Cognitive_Level."""
    class CognitiveLevel(models.TextChoices):
        REMEMBER = 'REMEMBER', 'Remember (C1)'
        UNDERSTAND = 'UNDERSTAND', 'Understand (C2)'
        APPLY = 'APPLY', 'Apply (C3)'
        ANALYZE = 'ANALYZE', 'Analyze (C4)'
        EVALUATE = 'EVALUATE', 'Evaluate (C5)'
        CREATE = 'CREATE', 'Create / Design (C6)'

    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name='outcomes')
    co_code = models.CharField(max_length=20)
    description = models.TextField(blank=True)
    cognitive_level = models.CharField(max_length=12, choices=CognitiveLevel.choices)
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ['order']
        unique_together = ('course', 'co_code')

    def __str__(self):
        return self.co_code


class CoPoMapping(models.Model):
    """SRS 3.4 CO-PO-PSO Mapping — level 0–3 plus justification used in the CD document."""
    course_outcome = models.ForeignKey(CourseOutcome, on_delete=models.CASCADE, related_name='mappings')
    po_key = models.CharField(max_length=8)
    level = models.PositiveSmallIntegerField(null=True, blank=True)
    justification = models.TextField(blank=True)

    class Meta:
        unique_together = ('course_outcome', 'po_key')

    def __str__(self):
        return f'{self.course_outcome.co_code} → {self.po_key} = {self.level}'


class LectureModule(models.Model):
    """Lecture-wise breakup / module plan for the Course Description."""
    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name='modules')
    order = models.PositiveSmallIntegerField(default=0)
    serial_no = models.CharField(max_length=10, blank=True)
    subtitle = models.CharField(max_length=255, blank=True)
    topics = models.TextField(blank=True)
    lectures = models.PositiveSmallIntegerField(default=0)
    remarks = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ['order']

    def __str__(self):
        return f'{self.course.course_code} module {self.serial_no or self.order}'


class CourseBook(models.Model):
    class Kind(models.TextChoices):
        TEXT = 'TEXT', 'Text Book'
        REFERENCE = 'REFERENCE', 'Reference Book'

    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name='books')
    kind = models.CharField(max_length=12, choices=Kind.choices)
    title = models.TextField()
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ['kind', 'order']

    def __str__(self):
        return self.title[:60]
