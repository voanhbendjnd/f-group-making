package com.fmaking.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import com.fmaking.domain.Group;

@Repository
public interface GroupRepository extends JpaRepository<Group, Long> {
}
