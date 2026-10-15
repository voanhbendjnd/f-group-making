package com.fmaking.repository;

import com.fmaking.domain.GroupStatusHistory;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface GroupStatusHistoryRepository extends JpaRepository<GroupStatusHistory, Long> {

    List<GroupStatusHistory> findByGroupIdOrderByCreatedAtDesc(Long groupId);
}
