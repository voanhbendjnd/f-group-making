package com.fmaking.repository;

import com.fmaking.domain.GroupMemberHistory;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface GroupMemberHistoryRepository extends JpaRepository<GroupMemberHistory, Long> {

    List<GroupMemberHistory> findByGroupIdOrderByCreatedAtDesc(Long groupId);

    List<GroupMemberHistory> findByStudentIdAndDeadlineIdOrderByCreatedAtDesc(Long studentId, Integer deadlineId);
}
