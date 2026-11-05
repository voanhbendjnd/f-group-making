package com.fmaking.service.dto;

import com.fmaking.domain.GroupStatus;
import java.util.List;

public final class DepartmentOverviewDTO {
    private DepartmentOverviewDTO() {}

    public record Statistics(long students, long activatedStudents, long groupedStudents, long unassignedStudents,
                             long groups, long openGroups, long pendingGroups, long acceptedGroups, long revokedGroups) {}
    public record Summary(long classes, long lecturers, long unassignedClasses, Statistics statistics) {}
    public record ClassRow(SchoolClassDTO schoolClass, Statistics statistics) {}
    public record Overview(Summary summary, ResultPaginationDTO classes) {}
    public record GroupRow(Long id, Integer sequenceNo, String name, GroupStatus status, String leaderName,
                           Integer deadlineId, String deadlineName, long members) {}
    public record ClassDetail(SchoolClassDTO schoolClass, Statistics statistics, List<GroupRow> groups, List<Long> assignedStudentIds) {}
}
