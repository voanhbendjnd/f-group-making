package com.fmaking.service;

import jakarta.persistence.EntityManager;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Clock;
import java.time.Duration;

@Service
public class AllocationRetentionService {
    private final EntityManager em;
    private final Clock clock;
    public AllocationRetentionService(EntityManager em, Clock clock) { this.em = em; this.clock = clock; }

    /** Successful runs and consumed-preview tombstones never expire. */
    @Scheduled(cron = "0 20 3 * * *")
    @Transactional
    public void clean() {
        var now = clock.instant();
        em.createQuery("update AllocationRun r set r.applyRequestId=null where r.applyRequestId in "
            + "(select a.id from AllocationApplyRequest a where a.expiresAt < :now and a.status <> :processing)")
            .setParameter("now", now).setParameter("processing", com.fmaking.domain.AllocationApplyRequest.Status.PROCESSING).executeUpdate();
        em.createQuery("delete from AllocationApplyRequest a where a.expiresAt < :now and a.status <> :processing")
            .setParameter("now", now).setParameter("processing", com.fmaking.domain.AllocationApplyRequest.Status.PROCESSING).executeUpdate();
        em.createQuery("update AllocationPreview p set p.payload=null where p.appliedAt < :cutoff")
            .setParameter("cutoff", now.minus(Duration.ofDays(30))).executeUpdate();
        em.createQuery("delete from AllocationPreview p where p.appliedAt is null and p.expiresAt < :cutoff "
            + "and not exists (select a.id from AllocationApplyRequest a where a.previewId=p.id) "
            + "and not exists (select r.id from AllocationRun r where r.previewId=p.id)")
            .setParameter("cutoff", now.minus(Duration.ofDays(1))).executeUpdate();
    }
}
