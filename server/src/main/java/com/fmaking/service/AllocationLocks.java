package com.fmaking.service;

import com.fmaking.domain.*;
import com.fmaking.repository.*;
import com.fmaking.web.rest.errors.*;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import org.springframework.stereotype.Service;
import java.util.Objects;

@Service
public class AllocationLocks {
    private final SchoolClassRepository classes;
    private final DeadlineRepository deadlines;
    private final SchoolClassAccessService access;
    private final EntityManager em;
    public AllocationLocks(SchoolClassRepository classes, DeadlineRepository deadlines, SchoolClassAccessService access, EntityManager em) {
        this.classes = classes; this.deadlines = deadlines; this.access = access; this.em = em;
    }
    public void scope(Integer classId, Integer deadlineId) {
        var schoolClass = classes.findByIdForUpdate(classId).orElseThrow(() -> new NotFoundAlertException("Class not found", "schoolClass", "classNotFound"));
        access.requireWriteAccess(schoolClass);
        deadlines.findForShare(deadlineId).orElseThrow(() -> new NotFoundAlertException("Deadline not found", "deadline", "ERR_DEADLINE_NOT_FOUND"));
        if (deadlines.countByDeadlineIdAndClassId(deadlineId, classId) != 1)
            throw new ForbiddenAlertException("Deadline not in class", "deadline", "ERR_DEADLINE_NOT_IN_CLASS");
    }
    public void data(Integer classId, Integer deadlineId) {
        var students = em.createQuery("select s from Student s where s.schoolClassId = :id order by s.userId", Student.class)
            .setParameter("id", classId).setLockMode(LockModeType.PESSIMISTIC_WRITE).getResultList();
        var userIds = students.stream().map(Student::getUserId).sorted().toList();
        var majorIds = students.stream().map(Student::getMajorId).filter(Objects::nonNull).distinct().sorted().toList();
        if (!userIds.isEmpty()) em.createQuery("select u from User u where u.id in :ids order by u.id", User.class)
            .setParameter("ids", userIds).setLockMode(LockModeType.PESSIMISTIC_READ).getResultList();
        if (!majorIds.isEmpty()) em.createQuery("select m from Major m where m.id in :ids order by m.id", Major.class)
            .setParameter("ids", majorIds).setLockMode(LockModeType.PESSIMISTIC_READ).getResultList();
        em.createQuery("select g from Group g where g.schoolClassId=:c and g.deadlineId=:d order by g.id", Group.class)
            .setParameter("c", classId).setParameter("d", deadlineId).setLockMode(LockModeType.PESSIMISTIC_WRITE).getResultList();
        em.createQuery("select m from GroupMember m where m.schoolClassId=:c and m.deadlineId=:d order by m.id", GroupMember.class)
            .setParameter("c", classId).setParameter("d", deadlineId).setLockMode(LockModeType.PESSIMISTIC_WRITE).getResultList();
        em.createQuery("select i from GroupInvitation i where i.schoolClassId=:c and i.deadlineId=:d order by i.id", GroupInvitation.class)
            .setParameter("c", classId).setParameter("d", deadlineId).setLockMode(LockModeType.PESSIMISTIC_WRITE).getResultList();
    }
}
