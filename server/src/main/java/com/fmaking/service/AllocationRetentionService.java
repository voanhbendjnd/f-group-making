package com.fmaking.service;

import jakarta.persistence.EntityManager;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Clock;

@Service
public class AllocationRetentionService {
    private final EntityManager em;
    private final Clock clock;
    public AllocationRetentionService(EntityManager em, Clock clock) { this.em = em; this.clock = clock; }

    /** Random plans/payloads and successful runs are permanent; only idempotency records expire. */
    @Scheduled(cron = "0 20 3 * * *")
    @Transactional
    public void clean() {
        var now = clock.instant();
        em.createQuery("update AllocationRun r set r.applyRequestId=null where r.applyRequestId in "
            + "(select a.id from AllocationApplyRequest a where a.expiresAt < :now and a.status <> :processing)")
            .setParameter("now", now).setParameter("processing", com.fmaking.domain.AllocationApplyRequest.Status.PROCESSING).executeUpdate();
        em.createQuery("delete from AllocationApplyRequest a where a.expiresAt < :now and a.status <> :processing")
            .setParameter("now", now).setParameter("processing", com.fmaking.domain.AllocationApplyRequest.Status.PROCESSING).executeUpdate();
    }
}
