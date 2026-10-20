package com.fmaking.repository;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import com.fmaking.domain.SchoolClass;
import com.fmaking.service.dto.SchoolClassDTO;

import java.util.List;
import java.util.Optional;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.Lock;

@Repository
public interface SchoolClassRepository extends JpaRepository<SchoolClass, Integer> {

    Optional<SchoolClass> findByNameIgnoreCaseAndTermId(String name, Integer termId);

    // Import and manual assignment must serialize against the same class row.
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT sc FROM SchoolClass sc WHERE LOWER(sc.name) = LOWER(:name) AND sc.termId = :termId")
    Optional<SchoolClass> findByNameAndTermIdForUpdate(@Param("name") String name, @Param("termId") Integer termId);

    List<SchoolClass> findByTermId(Integer termId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT sc FROM SchoolClass sc WHERE sc.id = :classId")
    Optional<SchoolClass> findByIdForUpdate(@Param("classId") Integer classId);

    @Query(
        value = """
            SELECT new com.fmaking.service.dto.SchoolClassDTO(
                sc.id, sc.name, sc.termId, t.name,
                sc.lecturerId, l.code, u.name, u.email,
                COUNT(s.userId), sc.createdDate
            )
            FROM SchoolClass sc
            LEFT JOIN Term t ON sc.termId = t.id
            LEFT JOIN Lecturer l ON sc.lecturerId = l.userId
            LEFT JOIN User u ON l.userId = u.id
            LEFT JOIN Student s ON s.schoolClassId = sc.id
            WHERE (:termId IS NULL OR sc.termId = :termId)
              AND (:lecturerId IS NULL OR sc.lecturerId = :lecturerId)
              AND (
                  :search IS NULL OR :search = ''
                  OR LOWER(sc.name) LIKE LOWER(CONCAT('%', :search, '%'))
                  OR LOWER(l.code) LIKE LOWER(CONCAT('%', :search, '%'))
                  OR LOWER(u.name) LIKE LOWER(CONCAT('%', :search, '%'))
                  OR LOWER(u.email) LIKE LOWER(CONCAT('%', :search, '%'))
              )
            GROUP BY sc.id, sc.name, sc.termId, t.name, sc.lecturerId, l.code, u.name, u.email, sc.createdDate
        """,
        countQuery = """
            SELECT COUNT(DISTINCT sc.id)
            FROM SchoolClass sc
            LEFT JOIN Lecturer l ON sc.lecturerId = l.userId
            LEFT JOIN User u ON l.userId = u.id
            WHERE (:termId IS NULL OR sc.termId = :termId)
              AND (:lecturerId IS NULL OR sc.lecturerId = :lecturerId)
              AND (
                  :search IS NULL OR :search = ''
                  OR LOWER(sc.name) LIKE LOWER(CONCAT('%', :search, '%'))
                  OR LOWER(l.code) LIKE LOWER(CONCAT('%', :search, '%'))
                  OR LOWER(u.name) LIKE LOWER(CONCAT('%', :search, '%'))
                  OR LOWER(u.email) LIKE LOWER(CONCAT('%', :search, '%'))
              )
        """
    )
    Page<SchoolClassDTO> searchClasses(
        @Param("search") String search,
        @Param("termId") Integer termId,
        @Param("lecturerId") Long lecturerId,
        Pageable pageable
    );

    @Query("""
        SELECT new com.fmaking.service.dto.SchoolClassDTO(
            sc.id, sc.name, sc.termId, t.name,
            sc.lecturerId, l.code, u.name, u.email,
            COUNT(s.userId), sc.createdDate
        )
        FROM SchoolClass sc
        LEFT JOIN Term t ON sc.termId = t.id
        LEFT JOIN Lecturer l ON sc.lecturerId = l.userId
        LEFT JOIN User u ON l.userId = u.id
        LEFT JOIN Student s ON s.schoolClassId = sc.id
        WHERE sc.id = :classId
        GROUP BY sc.id, sc.name, sc.termId, t.name, sc.lecturerId, l.code, u.name, u.email, sc.createdDate
    """)
    Optional<SchoolClassDTO> findClassDTOById(@Param("classId") Integer classId);
}
