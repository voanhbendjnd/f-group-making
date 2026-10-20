package com.fmaking.repository;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import com.fmaking.domain.Deadline;

import java.util.List;
import java.util.Optional;

@Repository
public interface DeadlineRepository extends JpaRepository<Deadline, Integer>, JpaSpecificationExecutor<Deadline> {

    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_READ)
    @Query("select d from Deadline d where d.id = :id")
    Optional<Deadline> findForShare(@Param("id") Integer id);

    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @Query("select d from Deadline d where d.id = :id")
    Optional<Deadline> findForUpdate(@Param("id") Integer id);

    @Query("SELECT DISTINCT d FROM Deadline d JOIN d.schoolClasses sc WHERE sc.lecturerId = :lecturerId")
    Page<Deadline> findAllByLecturerId(@Param("lecturerId") Long lecturerId, Pageable pageable);

    @Query("SELECT DISTINCT d FROM Deadline d JOIN d.schoolClasses sc WHERE sc.id = :classId")
    List<Deadline> findAllBySchoolClassId(@Param("classId") Integer classId);

    @Query("SELECT DISTINCT d FROM Deadline d LEFT JOIN FETCH d.schoolClasses WHERE d.id = :id")
    Optional<Deadline> findByIdWithClasses(@Param("id") Integer id);

    @Query("""
        SELECT COUNT(sc) FROM Deadline d JOIN d.schoolClasses sc
        WHERE d.id = :deadlineId AND sc.lecturerId != :lecturerId
    """)
    long countClassesNotOwnedByLecturer(@Param("deadlineId") Integer deadlineId, @Param("lecturerId") Long lecturerId);

    @Query("""
        SELECT COUNT(sc) FROM Deadline d JOIN d.schoolClasses sc
        WHERE d.id = :deadlineId AND sc.id = :classId
    """)
    long countByDeadlineIdAndClassId(@Param("deadlineId") Integer deadlineId, @Param("classId") Integer classId);
}
