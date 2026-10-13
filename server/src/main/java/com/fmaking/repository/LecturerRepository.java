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
    Optional<Lecturer> findByCodeIgnoreCase(String code);
    List<Lecturer> findByCodeIgnoreCaseIn(Collection<String> codes);
    Optional<Lecturer> findByUserId(Long userId);
    boolean existsByCodeIgnoreCase(String code);
}
