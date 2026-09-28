from django.db import migrations, models


def fill_sort_order(apps, schema_editor):
    Student = apps.get_model('assessments', 'Student')
    by_course = {}
    for s in Student.objects.all().order_by('course_id', 'roll_number', 'id'):
        by_course.setdefault(s.course_id, []).append(s)
    to_update = []
    for rows in by_course.values():
        for i, s in enumerate(rows):
            s.sort_order = i
            to_update.append(s)
    if to_update:
        Student.objects.bulk_update(to_update, ['sort_order'], batch_size=500)


class Migration(migrations.Migration):

    dependencies = [
        ('assessments', '0004_sheet_questions_grades'),
    ]

    operations = [
        migrations.AddField(
            model_name='student',
            name='sort_order',
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AlterModelOptions(
            name='student',
            options={'ordering': ['sort_order', 'id']},
        ),
        migrations.RunPython(fill_sort_order, migrations.RunPython.noop),
    ]
