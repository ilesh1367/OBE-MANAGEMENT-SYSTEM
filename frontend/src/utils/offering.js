export function teachingFacultyName(course) {
  return course?.teaching_faculty_name || course?.faculty_name || '—';
}

export function coordinatorName(course) {
  return course?.course_coordinator_name || course?.coordinator_names || course?.faculty_name || '—';
}

export function isLabCourse(course) {
  return course?.course_kind === 'LAB';
}

export function coursesListPath(course) {
  return isLabCourse(course) ? '/lab-courses' : '/courses';
}

export function coursesListLabel(course) {
  return isLabCourse(course) ? 'Lab Courses' : 'Courses';
}
