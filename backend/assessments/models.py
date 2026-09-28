from django.db import models
from courses.models import Course


SHEET_TYPES = ('T1', 'T2', 'T3', 'TA', 'FEEDBACK')


class Assessment(models.Model):
    """One exam/component block on a course offering (T1, T2, T3, TA, Feedback)."""
    class Type(models.TextChoices):
        T1 = 'T1', 'T1'
        T2 = 'T2', 'T2'
        T3 = 'T3', 'T3'
        TA = 'TA', 'TA (Attendance / Project / Assignment)'
        FEEDBACK = 'FEEDBACK', 'Course Exit Feedback'
        ASSIGNMENT = 'ASSIGNMENT', 'Assignment'
        ATTENDANCE = 'ATTENDANCE', 'Attendance'
        PROJECT = 'PROJECT', 'Project'

    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name='assessments')
    assessment_type = models.CharField(max_length=12, choices=Type.choices)
    exam_label = models.CharField(max_length=80, blank=True)
    max_marks = models.PositiveIntegerField(default=20)
    target_percent = models.PositiveSmallIntegerField(default=50)
    total_students = models.PositiveSmallIntegerField(default=0)
    appeared = models.PositiveSmallIntegerField(default=0)
    use_ceiling = models.BooleanField(default=False)

    class Meta:
        ordering = ['id']

    def __str__(self):
        return f'{self.course.course_code} — {self.assessment_type}'

    def display_label(self):
        return self.exam_label or {
            'T1': 'Exam: T1',
            'T2': 'Exam: T2',
            'T3': 'Exam: T3',
            'TA': 'TA Marks',
            'FEEDBACK': 'Course Exit Feedback',
        }.get(self.assessment_type, self.assessment_type)


class AssessmentQuestion(models.Model):
    """A column on a T1/T2/T3/TA/Feedback sheet, optionally mapped to one CO."""
    assessment = models.ForeignKey(Assessment, on_delete=models.CASCADE, related_name='questions')
    key = models.CharField(max_length=40)
    label = models.CharField(max_length=80)
    max_marks = models.DecimalField(max_digits=6, decimal_places=2, default=5)
    course_outcome = models.ForeignKey(
        'courses.CourseOutcome', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='assessment_questions',
    )
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ['order', 'id']
        unique_together = ('assessment', 'key')

    def __str__(self):
        return f'{self.assessment.assessment_type} {self.label}'


class Student(models.Model):
    """Shared roster for one course offering / session. Same roll on another year is a different row."""
    roll_number = models.CharField(max_length=30)
    name = models.CharField(max_length=255)
    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name='students')
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        unique_together = ('course', 'roll_number')
        ordering = ['sort_order', 'id']

    def __str__(self):
        return f'{self.roll_number} — {self.name}'


class StudentMark(models.Model):
    """Per-student mark for one question column. Blank cells are omitted (not stored as 0)."""
    assessment = models.ForeignKey(Assessment, on_delete=models.CASCADE, related_name='marks')
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='marks')
    question = models.ForeignKey(
        AssessmentQuestion, on_delete=models.CASCADE, null=True, blank=True, related_name='marks',
    )
    course_outcome = models.ForeignKey(
        'courses.CourseOutcome', on_delete=models.CASCADE, related_name='marks', null=True, blank=True,
    )
    marks_obtained = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)

    class Meta:
        unique_together = ('assessment', 'student', 'question')

    def __str__(self):
        return f'{self.student.roll_number} / {self.assessment} = {self.marks_obtained}'


class GradeBand(models.Model):
    """Result sheet grade cutoffs for a course offering (min total out of 100)."""
    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name='grade_bands')
    min_marks = models.DecimalField(max_digits=5, decimal_places=2)
    grade = models.CharField(max_length=8)
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ['min_marks', 'id']

    def __str__(self):
        return f'{self.course.course_code} {self.min_marks}+ → {self.grade}'
