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

    List<Group> findBySchoolClassIdAndDeadlineId(Integer schoolClassId, Integer deadlineId);

    List<Group> findBySchoolClassIdAndDeadlineIdAndStatus(Integer schoolClassId, Integer deadlineId, GroupStatus status);

    Optional<Group> findByIdAndSchoolClassIdAndDeadlineId(Long id, Integer schoolClassId, Integer deadlineId);

    boolean existsBySchoolClassIdAndDeadlineIdAndNameIgnoreCaseAndStatusNot(Integer schoolClassId, Integer deadlineId, String name, GroupStatus status);

    long countBySchoolClassIdAndDeadlineId(Integer schoolClassId, Integer deadlineId);
}
