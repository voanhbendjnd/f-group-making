package com.fmaking.repository;

import com.fmaking.domain.AllocationPreview;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface AllocationPreviewRepository extends JpaRepository<AllocationPreview, String> {
    Page<AllocationPreview> findBySchoolClassIdAndDeadlineIdOrderByCreatedAtDescIdDesc(Integer classId, Integer deadlineId, Pageable pageable);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from AllocationPreview p where p.id = :id")
    Optional<AllocationPreview> findForUpdate(@Param("id") String id);
}
