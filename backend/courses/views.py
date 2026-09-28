from rest_framework import viewsets, permissions
from rest_framework.decorators import action
from rest_framework.response import Response

from users.permissions import IsAdminRole
from .models import (
    AcademicSession, FacultyProfile, NbaSubjectCatalog, Course, CourseOutcome, CoPoMapping,
    copy_catalog_from_previous, is_lab_subject_name,
)
from .serializers import (
    AcademicSessionSerializer, FacultyProfileSerializer, NbaSubjectCatalogSerializer,
    CourseSerializer, CourseOutcomeSerializer, CoPoMappingSerializer,
)


def faculty_course_qs(user, qs):
    if user.is_faculty_role:
        return qs.filter(faculty=user)
    return qs


class AcademicSessionViewSet(viewsets.ModelViewSet):
    serializer_class = AcademicSessionSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = None
    queryset = AcademicSession.objects.all()

    def get_permissions(self):
        if self.request.method in ('POST', 'PUT', 'PATCH', 'DELETE'):
            return [IsAdminRole()]
        return [permissions.IsAuthenticated()]

    def perform_create(self, serializer):
        session = serializer.save()
        copy_catalog_from_previous(session)


class FacultyProfileViewSet(viewsets.ModelViewSet):
    serializer_class = FacultyProfileSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = None

    def get_permissions(self):
        if self.request.method in ('POST', 'PUT', 'PATCH', 'DELETE'):
            return [IsAdminRole()]
        return [permissions.IsAuthenticated()]

    def get_queryset(self):
        qs = FacultyProfile.objects.select_related('user').all()
        campus = self.request.query_params.get('campus')
        if campus:
            qs = qs.filter(campus=campus)
        if self.request.query_params.get('active') == '1':
            qs = qs.filter(is_active=True)
        return qs


class NbaSubjectCatalogViewSet(viewsets.ModelViewSet):
    serializer_class = NbaSubjectCatalogSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = None

    def get_permissions(self):
        if self.request.method in ('POST', 'PUT', 'PATCH', 'DELETE'):
            return [IsAdminRole()]
        return [permissions.IsAuthenticated()]

    def get_queryset(self):
        qs = NbaSubjectCatalog.objects.select_related('session').all()
        session_id = self.request.query_params.get('session')
        if session_id:
            # Carry subjects forward if this session was created before the feature existed.
            try:
                session = AcademicSession.objects.get(pk=session_id)
                copy_catalog_from_previous(session)
            except (AcademicSession.DoesNotExist, ValueError, TypeError):
                pass
            qs = qs.filter(session_id=session_id)
        year = self.request.query_params.get('calendar_year')
        sem = self.request.query_params.get('semester_type')
        if year:
            qs = qs.filter(session__calendar_year=year)
        if sem:
            qs = qs.filter(session__semester_type=sem)
        program = self.request.query_params.get('program')
        if program:
            qs = qs.filter(program_name__icontains=program)
        kind = (self.request.query_params.get('kind') or '').upper()
        if kind in ('LAB', 'THEORY'):
            # Filter in Python — lab detection is name-based (… LAB).
            lab_ids = [row.id for row in qs if is_lab_subject_name(row.course_name)]
            if kind == 'LAB':
                qs = qs.filter(id__in=lab_ids)
            else:
                qs = qs.exclude(id__in=lab_ids)
        return qs

    @action(detail=True, methods=['get'])
    def snapshot(self, request, pk=None):
        entry = self.get_object()
        return Response(NbaSubjectCatalogSerializer(entry).data)


class CourseViewSet(viewsets.ModelViewSet):
    """
    Faculty see only their own course offerings (per session).
    Admins see everything and can assign faculty.
    """
    serializer_class = CourseSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = None

    def get_queryset(self):
        qs = Course.objects.prefetch_related('outcomes__mappings', 'modules', 'books').select_related(
            'faculty', 'academic_session', 'catalog_entry', 'teaching_faculty', 'course_coordinator',
        )
        qs = faculty_course_qs(self.request.user, qs)
        year = self.request.query_params.get('academic_year') or self.request.query_params.get('session')
        if year:
            qs = qs.filter(academic_year=year)
        session_id = self.request.query_params.get('academic_session')
        if session_id:
            qs = qs.filter(academic_session_id=session_id)
        kind = (self.request.query_params.get('course_kind') or '').upper()
        if kind in ('LAB', 'THEORY'):
            qs = qs.filter(course_kind=kind)
        return qs

    def perform_create(self, serializer):
        user = self.request.user
        extra = {}
        if user.is_faculty_role:
            extra['faculty'] = user
            coord = serializer.validated_data.get('course_coordinator')
            if not serializer.validated_data.get('coordinator_names'):
                extra['coordinator_names'] = (
                    coord.full_name if coord else (user.get_full_name() or user.username)
                )
        serializer.save(**extra)

    def perform_update(self, serializer):
        if self.request.user.is_faculty_role:
            serializer.save(faculty=self.request.user)
        else:
            serializer.save()


class CourseOutcomeViewSet(viewsets.ModelViewSet):
    serializer_class = CourseOutcomeSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = None

    def get_queryset(self):
        qs = CourseOutcome.objects.select_related('course').prefetch_related('mappings')
        if self.request.user.is_faculty_role:
            qs = qs.filter(course__faculty=self.request.user)
        course_id = self.request.query_params.get('course')
        if course_id:
            qs = qs.filter(course_id=course_id)
        return qs


class CoPoMappingViewSet(viewsets.ModelViewSet):
    serializer_class = CoPoMappingSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = None

    def get_queryset(self):
        qs = CoPoMapping.objects.select_related('course_outcome__course')
        if self.request.user.is_faculty_role:
            qs = qs.filter(course_outcome__course__faculty=self.request.user)
        return qs
