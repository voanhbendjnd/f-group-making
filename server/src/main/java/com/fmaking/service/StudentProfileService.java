package com.fmaking.service;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import com.fmaking.domain.Student;
import com.fmaking.domain.GroupStatus;
import com.fmaking.repository.GroupMemberRepository;
import com.fmaking.repository.DeadlineRepository;
import com.fmaking.repository.UserRepository;
import com.fmaking.repository.StudentRepository;
import com.fmaking.repository.MajorRepository;
import com.fmaking.repository.SchoolClassRepository;
import com.fmaking.repository.TermRepository;
import com.fmaking.repository.GroupRepository;
import com.fmaking.security.SecurityUtils;
import com.fmaking.service.dto.StudentProfileDTO;
import com.fmaking.service.dto.StudentProfileDTO.ProfileInfo;
import com.fmaking.service.errors.DataResourceNotFoundException;

import java.util.Objects;

@Service
@Transactional(readOnly = true)
public class StudentProfileService {
    private final UserRepository users;
    private final StudentRepository students;
    private final MajorRepository majors;
    private final SchoolClassRepository classes;
    private final TermRepository terms;
    private final GroupRepository groups;
    private final GroupMemberRepository members;
    private final DeadlineRepository deadlines;
    private final GroupEventPublisher groupEventPublisher;

    public StudentProfileService(UserRepository users, StudentRepository students, MajorRepository majors,
                                 SchoolClassRepository classes, TermRepository terms, GroupRepository groups,
                                 GroupMemberRepository members, DeadlineRepository deadlines,
                                 GroupEventPublisher groupEventPublisher) {
        this.users = users;
        this.students = students;
        this.majors = majors;
        this.classes = classes;
        this.terms = terms;
        this.groups = groups;
        this.members = members;
        this.deadlines = deadlines;
        this.groupEventPublisher = groupEventPublisher;
    }

    public StudentProfileDTO getCurrentProfile() {
        var user = SecurityUtils.getCurrentUserLogin().flatMap(users::findOneByEmail)
                .orElseThrow(StudentProfileService::notFound);
        Student student = students.findById(user.getId()).orElseThrow(StudentProfileService::notFound);
        ProfileInfo major = student.getMajorId() == null ? unassigned() : majors.findById(student.getMajorId())
                .map(value -> available(value.getName())).orElseGet(StudentProfileService::missing);
        var schoolClass = student.getSchoolClassId() == null ? null
                : classes.findById(student.getSchoolClassId()).orElse(null);
        ProfileInfo classInfo = student.getSchoolClassId() == null ? unassigned()
                : schoolClass == null ? missing() : available(schoolClass.getName());
        ProfileInfo termInfo = schoolClass == null
                ? (student.getSchoolClassId() == null ? unassigned() : missing())
                : schoolClass.getTermId() == null ? unassigned() : terms.findById(schoolClass.getTermId())
                .map(value -> available(value.getName())).orElseGet(StudentProfileService::missing);
        ProfileInfo groupInfo = currentGroup(student, schoolClass != null);
        return new StudentProfileDTO(student.getFullName(), student.getRollNumber(), user.getEmail(),
                Boolean.TRUE.equals(user.getActivated()), major, classInfo, termInfo, groupInfo,
                student.getSchoolClassId(), student.getSelfDescription());
    }

    @Transactional
    public String updateBio(String bio) {
        var user = SecurityUtils.getCurrentUserLogin().flatMap(users::findOneByEmail)
                .orElseThrow(StudentProfileService::notFound);
        Student student = students.findById(user.getId()).orElseThrow(StudentProfileService::notFound);
        String trimmed = bio != null ? bio.trim() : null;
        if (trimmed != null && trimmed.length() > 500) {
            throw new com.fmaking.web.rest.errors.BadRequestAlertException("Bio must not exceed 500 characters", "studentProfile", "bioTooLong");
        }
        student.setSelfDescription(trimmed == null || trimmed.isEmpty() ? null : trimmed);
        students.save(student);
        broadcastBioUpdated(student, user.getEmail());
        return student.getSelfDescription();
    }

    @Transactional
    public void deleteBio() {
        var user = SecurityUtils.getCurrentUserLogin().flatMap(users::findOneByEmail)
                .orElseThrow(StudentProfileService::notFound);
        Student student = students.findById(user.getId()).orElseThrow(StudentProfileService::notFound);
        student.setSelfDescription(null);
        students.save(student);
        broadcastBioUpdated(student, user.getEmail());
    }

    private void broadcastBioUpdated(Student student, String actorEmail) {
        if (student.getSchoolClassId() == null) {
            return;
        }
        java.util.Map<String, Object> payload = java.util.Map.of(
            "studentId", student.getUserId(),
            "selfDescription", student.getSelfDescription() != null ? student.getSelfDescription() : ""
        );
        var classDeadlines = deadlines.findAllBySchoolClassId(student.getSchoolClassId());
        if (classDeadlines.isEmpty()) {
            groupEventPublisher.publish("STUDENT_BIO_UPDATED", null, null, student.getSchoolClassId(), actorEmail, payload);
        } else {
            for (var d : classDeadlines) {
                groupEventPublisher.publish("STUDENT_BIO_UPDATED", null, d.getId(), student.getSchoolClassId(), actorEmail, payload);
            }
        }
    }

    private ProfileInfo currentGroup(Student student, boolean hasClass) {
        var memberships = members.findByStudentId(student.getUserId());
        if (memberships.isEmpty()) {
            // The legacy Student.groupId is retained but never used to infer current membership.
            return unassigned();
        }
        if (!hasClass || memberships.size() != 1) return missing();
        var membership = memberships.get(0);
        if (!Objects.equals(membership.getSchoolClassId(), student.getSchoolClassId())) return missing();
        return groups.findById(membership.getGroupId())
                .filter(group -> group.getStatus() != GroupStatus.DISBANDED
                        && Objects.equals(group.getSchoolClassId(), student.getSchoolClassId())
                        && Objects.equals(group.getDeadlineId(), membership.getDeadlineId())
                        && deadlines.countByDeadlineIdAndClassId(group.getDeadlineId(), student.getSchoolClassId()) == 1)
                .map(group -> available(group.getName())).orElseGet(StudentProfileService::missing);
    }

    private static ProfileInfo available(String name) {
        return name == null || name.isBlank() ? missing() : new ProfileInfo(name, "AVAILABLE");
    }

    private static ProfileInfo unassigned() { return new ProfileInfo(null, "UNASSIGNED"); }
    private static ProfileInfo missing() { return new ProfileInfo(null, "MISSING"); }
    private static DataResourceNotFoundException notFound() {
        return new DataResourceNotFoundException("Student profile not found", "studentProfile", "profileNotFound");
    }
}
