package com.fmaking.repository;

import com.fmaking.domain.AllocationApplyRequest;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import java.util.Optional;

public interface AllocationApplyRequestRepository extends JpaRepository<AllocationApplyRequest, Long> {
    Optional<AllocationApplyRequest> findByOwnerIdAndSchoolClassIdAndDeadlineIdAndKeyHash(Long owner, Integer schoolClassId, Integer deadlineId, String hash);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select r from AllocationApplyRequest r where r.id = :id")
    Optional<AllocationApplyRequest> findForUpdate(@Param("id") Long id);
}
