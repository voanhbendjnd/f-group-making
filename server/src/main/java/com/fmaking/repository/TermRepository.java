package com.fmaking.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import com.fmaking.domain.Term;

import java.util.Optional;
import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

@Repository
public interface TermRepository extends JpaRepository<Term, Integer> {
    Optional<Term> findByNameIgnoreCase(String name);
    boolean existsByNameIgnoreCase(String name);

    @Query("""
        SELECT u.id FROM User u WHERE u.id IN :userIds AND (
            EXISTS (SELECT s.userId FROM Student s, SchoolClass sc
                    WHERE s.userId = u.id AND s.schoolClassId = sc.id AND sc.termId = :termId)
            OR EXISTS (SELECT l.userId FROM Lecturer l, SchoolClass sc
                    WHERE l.userId = u.id AND sc.lecturerId = l.userId AND sc.termId = :termId)
        )
        """)
    List<Long> findUserIdsInTerm(@Param("userIds") Collection<Long> userIds, @Param("termId") Integer termId);

    @Query("SELECT u.id FROM User u WHERE LOWER(u.email) = LOWER(:email)")
    Optional<Long> findUserIdByEmail(@Param("email") String email);
}
