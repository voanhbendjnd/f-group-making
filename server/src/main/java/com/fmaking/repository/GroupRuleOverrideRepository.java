package com.fmaking.repository;

import com.fmaking.domain.GroupRuleOverride;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface GroupRuleOverrideRepository extends JpaRepository<GroupRuleOverride, Long> {

    List<GroupRuleOverride> findByGroupIdOrderByCreatedAtDesc(Long groupId);
}
