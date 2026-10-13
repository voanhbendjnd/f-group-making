package com.fmaking.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import com.fmaking.domain.Rule;

import java.util.List;

public interface RuleRepository extends JpaRepository<Rule, Integer> {
    List<Rule> findBySchoolClassId(Integer schoolClassId);
}
