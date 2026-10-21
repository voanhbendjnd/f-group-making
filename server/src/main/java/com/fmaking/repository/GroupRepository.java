package com.fmaking.repository;

import com.fmaking.domain.Group;
import com.fmaking.domain.GroupStatus;
import jakarta.persistence.LockModeType;
import jakarta.persistence.QueryHint;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.jpa.repository.QueryHints;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface GroupRepository extends JpaRepository<Group, Long>, JpaSpecificationExecutor<Group> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @QueryHints({@QueryHint(name = "jakarta.persistence.lock.timeout", value = "3000")})
    @Query("SELECT g FROM Group g WHERE g.id = :id")
    Optional<Group> findByIdForUpdate(@Param("id") Long id);

    @Query("SELECT g FROM Group g WHERE g.schoolClassId = :schoolClassId AND g.deadlineId = :deadlineId " +
        "ORDER BY CASE WHEN g.sequenceNo IS NULL THEN 1 ELSE 0 END, g.sequenceNo, g.id")
    List<Group> findBySchoolClassIdAndDeadlineId(@Param("schoolClassId") Integer schoolClassId, @Param("deadlineId") Integer deadlineId);

    List<Group> findBySchoolClassIdAndDeadlineIdAndStatus(Integer schoolClassId, Integer deadlineId, GroupStatus status);

    Optional<Group> findByIdAndSchoolClassIdAndDeadlineId(Long id, Integer schoolClassId, Integer deadlineId);

    boolean existsBySchoolClassIdAndDeadlineIdAndNameIgnoreCaseAndStatusNot(Integer schoolClassId, Integer deadlineId, String name, GroupStatus status);

    long countBySchoolClassIdAndDeadlineId(Integer schoolClassId, Integer deadlineId);
}
