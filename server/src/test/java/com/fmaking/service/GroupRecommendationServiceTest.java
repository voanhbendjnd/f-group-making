package com.fmaking.service;

import com.fmaking.domain.Group;
import com.fmaking.domain.GroupMember;
import com.fmaking.domain.GroupStatus;
import com.fmaking.repository.*;
import com.fmaking.service.dto.GroupMemberDTO;
import com.fmaking.service.projection.StudentRow;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class GroupRecommendationServiceTest {
    @Mock GroupRepository groups;
    @Mock GroupMemberRepository members;
    @Mock StudentRepository students;
    @Mock GroupRuleValidationService rules;
    @Mock UserRepository users;
    GroupRecommendationService service;

    @BeforeEach void setup() { service = new GroupRecommendationService(groups, members, students, rules, users); }

    @Test void scoresAndReasonsAgreeInBothDirectionsAndExcludeAssignedStudents() {
        Group group = group(GroupStatus.OPEN);
        var classStudents = List.of(student(1, 1, "SE"), student(2, 2, "ENG"),
            student(3, 1, "SE"), student(4, 2, "ENG"), student(5, 3, "MKT"), student(6, 4, "GD"));
        when(groups.findById(10L)).thenReturn(Optional.of(group));
        when(groups.findBySchoolClassIdAndDeadlineId(1, 8)).thenReturn(List.of(group));
        when(members.findByGroupId(10L)).thenReturn(List.of(member(1), member(2)));
        when(members.findBySchoolClassIdAndDeadlineId(1, 8)).thenReturn(List.of(member(1), member(2)));
        when(students.findStudentsBySchoolClassId(1)).thenReturn(classStudents);
        when(students.findStudentProjectionById(5L)).thenReturn(Optional.of(classStudents.get(4)));
        when(rules.getClassRules(1)).thenReturn(List.of());

        var candidates = service.recommendStudentsForGroup(10L, 1, 8);
        assertThat(candidates).extracting(GroupMemberDTO::getStudentId).containsExactly(5L, 6L, 3L, 4L);
        var groupSuggestions = service.recommendGroupsForStudent(5L, 1, 8);
        assertThat(groupSuggestions).hasSize(1);
        assertThat(groupSuggestions.getFirst().getMatchScore()).isEqualTo(candidates.getFirst().getMatchScore());
        assertThat(groupSuggestions.getFirst().getMatchReasons()).isEqualTo(candidates.getFirst().getMatchReasons());
        assertThat(groupSuggestions.getFirst().getMaxMembers()).isEqualTo(6);
    }

    @Test void rejectsGroupSuggestionsForAnAlreadyAssignedStudent() {
        when(students.findStudentProjectionById(1L)).thenReturn(Optional.of(student(1, 1, "SE")));
        when(students.findStudentsBySchoolClassId(1)).thenReturn(List.of(student(1, 1, "SE")));
        when(members.findBySchoolClassIdAndDeadlineId(1, 8)).thenReturn(List.of(member(1)));
        assertThat(service.recommendGroupsForStudent(1L, 1, 8)).isEmpty();
    }

    @Test void closedGroupsHaveNoMemberSuggestions() {
        for (var status : List.of(GroupStatus.PENDING, GroupStatus.ACCEPTED, GroupStatus.DISBANDED)) {
            when(groups.findById(10L)).thenReturn(Optional.of(group(status)));
            assertThat(service.recommendStudentsForGroup(10L, 1, 8)).isEmpty();
        }
        verifyNoInteractions(students, members, rules);
    }

    @Test void recalculatesScoresFromCurrentMembershipAfterAnAssignment() {
        var initial = List.of(student(1, 1, "SE"), student(2, 2, "ENG"), student(3, 1, "SE"),
            student(4, 3, "MKT"), student(5, 4, "GD"));
        when(groups.findById(10L)).thenReturn(Optional.of(group(GroupStatus.REVOKED)));
        when(students.findStudentsBySchoolClassId(1)).thenReturn(initial);
        when(members.findByGroupId(10L)).thenReturn(List.of(member(1)), List.of(member(1), member(2)));
        when(members.findBySchoolClassIdAndDeadlineId(1, 8))
            .thenReturn(List.of(member(1)), List.of(member(1), member(2)));
        var before = service.recommendStudentsForGroup(10L, 1, 8);
        var after = service.recommendStudentsForGroup(10L, 1, 8);
        assertThat(before).extracting(GroupMemberDTO::getStudentId).contains(2L);
        assertThat(after).extracting(GroupMemberDTO::getStudentId).containsExactly(4L, 5L, 3L);
        assertThat(after.getFirst().getMatchScore()).isGreaterThan(after.getLast().getMatchScore());
    }

    private static Group group(GroupStatus status) {
        var group = new Group(); group.setId(10L); group.setStatus(status); group.setName("Group 10");
        group.setSchoolClassId(1); group.setDeadlineId(8); return group;
    }

    private static GroupMember member(long studentId) {
        var member = new GroupMember(); member.setGroupId(10L); member.setStudentId(studentId);
        member.setSchoolClassId(1); member.setDeadlineId(8); return member;
    }

    private static StudentRow student(long id, int major, String code) {
        return new StudentRow(id, "R" + id, "Student " + id, id + "@example.test", "M" + id,
            major, code, code, true, null, null, null, null);
    }
}
