package com.fmaking.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import com.fmaking.domain.MajorTerm;

@Repository
public interface MajorTermRepository extends JpaRepository<MajorTerm,Long> {
}
