package com.fmaking.service;

import com.fmaking.domain.GroupStatus;
import com.fmaking.domain.SchoolClass;
import com.fmaking.repository.DepartmentOverviewRepository;
import com.fmaking.repository.SchoolClassRepository;
import com.fmaking.service.dto.DepartmentOverviewDTO.*;
import com.fmaking.service.dto.ResultPaginationDTO;
import com.fmaking.service.dto.SchoolClassDTO;
import com.fmaking.web.rest.errors.BadRequestAlertException;
import org.springframework.data.domain.Pageable;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.*;

@Service
@Transactional(readOnly = true, isolation = org.springframework.transaction.annotation.Isolation.REPEATABLE_READ)
@PreAuthorize("hasAnyAuthority('ROLE_ADMIN', 'ROLE_LECTURE_MASTER')")
public class DepartmentOverviewService {
    private final DepartmentOverviewRepository overview;
    private final SchoolClassRepository classes;
    private final SchoolClassService schoolClasses;
    private final TermService terms;

    public DepartmentOverviewService(DepartmentOverviewRepository overview, SchoolClassRepository classes,
                                     SchoolClassService schoolClasses, TermService terms) {
        this.overview = overview; this.classes = classes; this.schoolClasses = schoolClasses; this.terms = terms;
    }

    public Overview overview(Integer termId, String search, ClassViewScope scope, Pageable pageable) {
        terms.validateTerm(termId);
        var allClasses = classes.findByTermId(termId);
        var counts = statistics(termId, null);
        var summary = new Summary(allClasses.size(), allClasses.stream().map(SchoolClass::getLecturerId)
            .filter(Objects::nonNull).distinct().count(), allClasses.stream().filter(c -> c.getLecturerId() == null).count(),
            sum(counts.values()));
        var page = schoolClasses.getSchoolClasses(search, termId, pageable, scope);
        @SuppressWarnings("unchecked")
        var rows = ((List<SchoolClassDTO>) page.getResult()).stream().map(c -> new ClassRow(c, counts.get(c.getId()))).toList();
        return new Overview(summary, new ResultPaginationDTO(page.getMeta(), rows));
    }

    public ClassDetail detail(Integer termId, Integer classId) {
        terms.validateTerm(termId);
        var schoolClass = schoolClasses.getSchoolClassById(classId);
        if (!Objects.equals(schoolClass.getTermId(), termId))
            throw new BadRequestAlertException("Class does not belong to selected term", "schoolClass", "classNotInTerm");
        return new ClassDetail(schoolClass, statistics(termId, classId).get(classId), overview.groups(classId), overview.assignedStudentIds(classId));
    }

    private Map<Integer, Statistics> statistics(Integer termId, Integer classId) {
        Map<Integer, EnumMap<GroupStatus, Long>> groups = new HashMap<>();
        overview.groupCounts(termId, classId).forEach(row -> groups.computeIfAbsent(row.classId(), ignored -> new EnumMap<>(GroupStatus.class))
            .put(row.status(), row.groups()));
        Map<Integer, Long> assigned = new HashMap<>();
        overview.assignedStudents(termId, classId).forEach(row -> assigned.put(row.classId(), row.students()));
        Map<Integer, Statistics> result = new HashMap<>();
        overview.enrollment(termId, classId).forEach(row -> {
            var status = groups.getOrDefault(row.classId(), new EnumMap<>(GroupStatus.class));
            long grouped = assigned.getOrDefault(row.classId(), 0L);
            result.put(row.classId(), new Statistics(row.students(), row.activated(), grouped, Math.max(0, row.students() - grouped),
                status.values().stream().mapToLong(Long::longValue).sum(), status.getOrDefault(GroupStatus.OPEN, 0L),
                status.getOrDefault(GroupStatus.PENDING, 0L), status.getOrDefault(GroupStatus.ACCEPTED, 0L), status.getOrDefault(GroupStatus.REVOKED, 0L)));
        });
        return result;
    }

    private Statistics sum(Collection<Statistics> values) {
        return new Statistics(values.stream().mapToLong(Statistics::students).sum(), values.stream().mapToLong(Statistics::activatedStudents).sum(),
            values.stream().mapToLong(Statistics::groupedStudents).sum(), values.stream().mapToLong(Statistics::unassignedStudents).sum(),
            values.stream().mapToLong(Statistics::groups).sum(), values.stream().mapToLong(Statistics::openGroups).sum(),
            values.stream().mapToLong(Statistics::pendingGroups).sum(), values.stream().mapToLong(Statistics::acceptedGroups).sum(),
            values.stream().mapToLong(Statistics::revokedGroups).sum());
    }
}
