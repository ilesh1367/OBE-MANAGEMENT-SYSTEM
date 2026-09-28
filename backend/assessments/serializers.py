from rest_framework import serializers
from courses.access import faculty_owns_course
from .models import Assessment, AssessmentQuestion, Student, StudentMark, GradeBand


def _owned_course(user, course):
    if user and not faculty_owns_course(user, course):
        raise serializers.ValidationError('You can only use your own course offerings.')
    return course


class AssessmentQuestionSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(required=False)

    class Meta:
        model = AssessmentQuestion
        fields = ['id', 'assessment', 'key', 'label', 'max_marks', 'course_outcome', 'order']
        extra_kwargs = {
            'id': {'read_only': False, 'required': False},
            'assessment': {'required': False},
        }


class AssessmentSerializer(serializers.ModelSerializer):
    questions = AssessmentQuestionSerializer(many=True, required=False)
    exam_label_display = serializers.SerializerMethodField()

    class Meta:
        model = Assessment
        fields = [
            'id', 'course', 'assessment_type', 'exam_label', 'exam_label_display',
            'max_marks', 'target_percent', 'total_students', 'appeared', 'use_ceiling',
            'questions',
        ]

    def get_exam_label_display(self, obj):
        return obj.display_label()

    def validate_course(self, course):
        request = self.context.get('request')
        return _owned_course(getattr(request, 'user', None), course)

    def update(self, instance, validated_data):
        questions_data = validated_data.pop('questions', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if questions_data is not None:
            keep = []
            for i, q in enumerate(questions_data):
                q.pop('assessment', None)
                qid = q.pop('id', None)
                q['order'] = i
                key = (q.get('key') or f'Q{i+1}').strip()
                q['key'] = key
                obj = instance.questions.filter(pk=qid).first() if qid else None
                if not obj:
                    obj = instance.questions.filter(key=key).first()
                if obj:
                    for attr, value in q.items():
                        setattr(obj, attr, value)
                    obj.save()
                else:
                    obj = AssessmentQuestion.objects.create(assessment=instance, **q)
                keep.append(obj.id)
            instance.questions.exclude(id__in=keep).delete()
            total = sum(float(x.max_marks) for x in instance.questions.all())
            instance.max_marks = max(1, int(round(total)) or instance.max_marks)
            instance.save(update_fields=['max_marks'])
        return instance


class StudentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Student
        fields = ['id', 'roll_number', 'name', 'course', 'sort_order']
        extra_kwargs = {'sort_order': {'required': False}}

    def validate_course(self, course):
        request = self.context.get('request')
        return _owned_course(getattr(request, 'user', None), course)


class StudentMarkSerializer(serializers.ModelSerializer):
    class Meta:
        model = StudentMark
        fields = ['id', 'assessment', 'student', 'question', 'course_outcome', 'marks_obtained']
        validators = []

    def validate(self, attrs):
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        assessment = attrs.get('assessment') or getattr(self.instance, 'assessment', None)
        student = attrs.get('student') or getattr(self.instance, 'student', None)
        outcome = attrs.get('course_outcome', getattr(self.instance, 'course_outcome', None))
        question = attrs.get('question', getattr(self.instance, 'question', None))
        if assessment:
            _owned_course(user, assessment.course)
        if student:
            _owned_course(user, student.course)
        if assessment and student and student.course_id != assessment.course_id:
            raise serializers.ValidationError('Student and assessment must belong to the same course.')
        if outcome and assessment and outcome.course_id != assessment.course_id:
            raise serializers.ValidationError('Course outcome must belong to the same course.')
        if question and assessment and question.assessment_id != assessment.id:
            raise serializers.ValidationError('Question must belong to this assessment.')
        if question and not outcome:
            attrs['course_outcome'] = question.course_outcome
        return attrs


class GradeBandSerializer(serializers.ModelSerializer):
    class Meta:
        model = GradeBand
        fields = ['id', 'course', 'min_marks', 'grade', 'order']

    def validate_course(self, course):
        request = self.context.get('request')
        return _owned_course(getattr(request, 'user', None), course)
