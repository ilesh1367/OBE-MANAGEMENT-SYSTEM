from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('courses', '0008_course_kind_catalog_carry'),
    ]

    operations = [
        # Column may already exist in Neon (orphan NOT NULL) — only update Django state + backfill.
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AddField(
                    model_name='course',
                    name='is_lab',
                    field=models.BooleanField(default=False),
                ),
            ],
            database_operations=[
                migrations.RunSQL(
                    sql="""
                    DO $$
                    BEGIN
                        IF NOT EXISTS (
                            SELECT 1 FROM information_schema.columns
                            WHERE table_name = 'courses_course' AND column_name = 'is_lab'
                        ) THEN
                            ALTER TABLE courses_course
                                ADD COLUMN is_lab boolean DEFAULT false NOT NULL;
                        ELSE
                            ALTER TABLE courses_course
                                ALTER COLUMN is_lab SET DEFAULT false;
                            UPDATE courses_course
                                SET is_lab = (COALESCE(course_kind, 'THEORY') = 'LAB')
                                WHERE is_lab IS NULL;
                            ALTER TABLE courses_course
                                ALTER COLUMN is_lab SET NOT NULL;
                        END IF;
                        UPDATE courses_course
                            SET is_lab = (COALESCE(course_kind, 'THEORY') = 'LAB');
                    END $$;
                    """,
                    reverse_sql=migrations.RunSQL.noop,
                ),
            ],
        ),
    ]
