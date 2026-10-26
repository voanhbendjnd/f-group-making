package com.fmaking.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.stereotype.Repository;
import com.fmaking.domain.Lecturer;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

@Repository
public interface LecturerRepository extends JpaRepository<Lecturer, Long>, JpaSpecificationExecutor<Lecturer> {
    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @org.springframework.data.jpa.repository.Query("select l from Lecturer l where l.userId = :id")
    Optional<Lecturer> findByIdForUpdate(@org.springframework.data.repository.query.Param("id") Long id);
    Optional<Lecturer> findByCodeIgnoreCase(String code);
    List<Lecturer> findByCodeIgnoreCaseIn(Collection<String> codes);
    Optional<Lecturer> findByUserId(Long userId);
    boolean existsByCodeIgnoreCase(String code);
}
