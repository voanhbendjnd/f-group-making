package com.fmaking.service;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import com.fmaking.domain.Student;
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

    public StudentProfileService(UserRepository users, StudentRepository students, MajorRepository majors,
                                 SchoolClassRepository classes, TermRepository terms, GroupRepository groups) {
        this.users = users;
        this.students = students;
        this.majors = majors;
        this.classes = classes;
        this.terms = terms;
        this.groups = groups;
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
        ProfileInfo groupInfo = student.getGroupId() == null ? unassigned()
                : schoolClass == null ? missing() : groups.findById(student.getGroupId())
                .filter(value -> schoolClass != null && Objects.equals(value.getSchoolClassId(), schoolClass.getId()))
                .map(value -> available(value.getName())).orElseGet(StudentProfileService::missing);
        return new StudentProfileDTO(student.getFullName(), student.getRollNumber(), user.getEmail(),
                Boolean.TRUE.equals(user.getActivated()), major, classInfo, termInfo, groupInfo, student.getSchoolClassId());
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
