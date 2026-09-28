import re

from django.db import migrations, models


def backfill_lab_kind(apps, schema_editor):
    Course = apps.get_model('courses', 'Course')
    for course in Course.objects.all().iterator():
        name = (course.course_name or '').strip()
        if name and re.search(r'\bLAB\b', name, re.I):
            course.course_kind = 'LAB'
            course.save(update_fields=['course_kind'])


class Migration(migrations.Migration):

    dependencies = [
        ('courses', '0007_session_catalog_faculty'),
    ]

    operations = [
        migrations.AddField(
            model_name='course',
            name='course_kind',
            field=models.CharField(
                choices=[('THEORY', 'Theory'), ('LAB', 'Lab')],
                default='THEORY',
                max_length=10,
            ),
        ),
        migrations.RunPython(backfill_lab_kind, migrations.RunPython.noop),
    ]
