package com.fmaking.repository;

import com.fmaking.domain.GroupStatus;
import com.fmaking.service.dto.DepartmentOverviewDTO.GroupRow;
import jakarta.persistence.EntityManager;
import org.springframework.stereotype.Repository;
import java.util.List;

/** Aggregate counts without loading every student's account or every membership into memory. */
@Repository
public class DepartmentOverviewRepository {
    private final EntityManager em;
    public DepartmentOverviewRepository(EntityManager em) { this.em = em; }

    public record Enrollment(Integer classId, long students, long activated) {}
    public record StatusCount(Integer classId, GroupStatus status, long groups) {}
    public record AssignedCount(Integer classId, long students) {}

    public List<Enrollment> enrollment(Integer termId, Integer classId) {
        return em.createQuery("""
            select c.id, count(s.userId), coalesce(sum(case when u.activated = true then 1 else 0 end), 0)
            from SchoolClass c left join Student s on s.schoolClassId = c.id left join User u on u.id = s.userId
            where c.termId = :termId and (:classId is null or c.id = :classId) group by c.id
            """, Object[].class).setParameter("termId", termId).setParameter("classId", classId).getResultList().stream()
            .map(row -> new Enrollment((Integer) row[0], ((Number) row[1]).longValue(), ((Number) row[2]).longValue())).toList();
    }

    public List<StatusCount> groupCounts(Integer termId, Integer classId) {
        return em.createQuery("""
            select c.id, g.status, count(g.id) from Group g join SchoolClass c on c.id = g.schoolClassId
            where c.termId = :termId and (:classId is null or c.id = :classId) and g.status <> :disbanded
            group by c.id, g.status
            """, Object[].class).setParameter("termId", termId).setParameter("classId", classId)
            .setParameter("disbanded", GroupStatus.DISBANDED).getResultList().stream()
            .map(row -> new StatusCount((Integer) row[0], (GroupStatus) row[1], ((Number) row[2]).longValue())).toList();
    }

    public List<AssignedCount> assignedStudents(Integer termId, Integer classId) {
        return em.createQuery("""
            select c.id, count(distinct s.userId) from SchoolClass c
            join Student s on s.schoolClassId = c.id
            join GroupMember m on m.studentId = s.userId and m.schoolClassId = c.id
            join Group g on g.id = m.groupId and g.schoolClassId = c.id and g.deadlineId = m.deadlineId
            where c.termId = :termId and (:classId is null or c.id = :classId) and g.status <> :disbanded
            group by c.id
            """, Object[].class).setParameter("termId", termId).setParameter("classId", classId)
            .setParameter("disbanded", GroupStatus.DISBANDED).getResultList().stream()
            .map(row -> new AssignedCount((Integer) row[0], ((Number) row[1]).longValue())).toList();
    }

    public List<GroupRow> groups(Integer classId) {
        return em.createQuery("""
            select g.id, g.sequenceNo, g.name, g.status, leader.fullName, g.deadlineId, d.name, count(distinct student.userId)
            from Group g left join Deadline d on d.id = g.deadlineId
            left join Student leader on leader.userId = g.leaderId and leader.schoolClassId = g.schoolClassId
            left join GroupMember m on m.groupId = g.id and m.schoolClassId = g.schoolClassId and m.deadlineId = g.deadlineId
            left join Student student on student.userId = m.studentId and student.schoolClassId = g.schoolClassId
            where g.schoolClassId = :classId and g.status <> :disbanded
            group by g.id, g.sequenceNo, g.name, g.status, leader.fullName, g.deadlineId, d.name
            order by g.sequenceNo, g.id
            """, Object[].class).setParameter("classId", classId).setParameter("disbanded", GroupStatus.DISBANDED)
            .getResultList().stream().map(row -> new GroupRow((Long) row[0], (Integer) row[1], (String) row[2],
                (GroupStatus) row[3], (String) row[4], (Integer) row[5], (String) row[6], ((Number) row[7]).longValue())).toList();
    }

    public List<Long> assignedStudentIds(Integer classId) {
        return em.createQuery("""
            select distinct s.userId from Student s
            join GroupMember m on m.studentId = s.userId and m.schoolClassId = s.schoolClassId
            join Group g on g.id = m.groupId and g.schoolClassId = s.schoolClassId and g.deadlineId = m.deadlineId
            where s.schoolClassId = :classId and g.status <> :disbanded
            """, Long.class).setParameter("classId", classId).setParameter("disbanded", GroupStatus.DISBANDED).getResultList();
    }
}
