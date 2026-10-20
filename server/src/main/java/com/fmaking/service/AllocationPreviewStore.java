package com.fmaking.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fmaking.domain.AllocationPreview;
import com.fmaking.repository.AllocationPreviewRepository;
import com.fmaking.service.dto.AllocationPreviewDTO;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Clock;
import java.time.Duration;
import java.util.UUID;

@Service
public class AllocationPreviewStore {
    private final AllocationPreviewRepository previews;
    private final ObjectMapper mapper;
    private final Clock clock;
    private final SchoolClassAccessService access;
    public AllocationPreviewStore(AllocationPreviewRepository previews, ObjectMapper mapper, Clock clock, SchoolClassAccessService access) {
        this.previews = previews; this.mapper = mapper; this.clock = clock; this.access = access;
    }

    @Transactional
    public AllocationPreviewDTO store(AllocationPreviewDTO result) {
        var row = new AllocationPreview(); row.setId(UUID.randomUUID().toString()); row.setOwnerId(access.currentLecturerId());
        row.setSchoolClassId(result.scope().classId()); row.setDeadlineId(result.scope().deadlineId());
        row.setTargetCount(result.result().targetGroupCount()); row.setSeed(result.result().seed());
        row.setSnapshotFingerprint(result.snapshotFingerprint()); row.setPlanFingerprint(result.planFingerprint());
        row.setCreatedAt(clock.instant().truncatedTo(java.time.temporal.ChronoUnit.MICROS));
        // Legacy NOT NULL column retained for schema compatibility only. It no longer controls Apply or retention.
        row.setExpiresAt(row.getCreatedAt().plus(Duration.ofMinutes(15)));
        try { row.setPayload(mapper.writeValueAsString(result)); }
        catch (JsonProcessingException exception) { throw new IllegalStateException("Cannot store allocation preview", exception); }
        previews.saveAndFlush(row);
        return new AllocationPreviewDTO(result.scope(), result.snapshotFingerprint(), result.planFingerprint(), result.sameAsPreviousPlan(),
            result.result(), result.groups(), result.report(), row.getId(), row.getCreatedAt(), null);
    }
}
