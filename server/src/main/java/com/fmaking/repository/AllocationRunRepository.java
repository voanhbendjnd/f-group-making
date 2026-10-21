package com.fmaking.repository;

import com.fmaking.domain.AllocationRun;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.domain.*;
import java.util.Optional;

public interface AllocationRunRepository extends JpaRepository<AllocationRun, Long> {
    Page<AllocationRun> findBySchoolClassIdAndDeadlineIdOrderByAppliedAtDescIdDesc(Integer schoolClassId, Integer deadlineId, Pageable pageable);
    Optional<AllocationRun> findByIdAndSchoolClassIdAndDeadlineId(Long id, Integer schoolClassId, Integer deadlineId);
}
