package com.fmaking.repository;

import com.fmaking.domain.AllocationPreview;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import java.util.Optional;

public interface AllocationPreviewRepository extends JpaRepository<AllocationPreview, String> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from AllocationPreview p where p.id = :id")
    Optional<AllocationPreview> findForUpdate(@Param("id") String id);
}
