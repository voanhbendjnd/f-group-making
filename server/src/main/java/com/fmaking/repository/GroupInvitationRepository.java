package com.fmaking.repository;

import com.fmaking.domain.GroupInvitation;
import com.fmaking.domain.GroupInvitationStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface GroupInvitationRepository extends JpaRepository<GroupInvitation, Long> {
    List<GroupInvitation> findBySchoolClassIdAndDeadlineIdAndStatus(Integer classId, Integer deadlineId, GroupInvitationStatus status);

    List<GroupInvitation> findByStudentIdAndDeadlineIdAndStatus(Long studentId, Integer deadlineId, GroupInvitationStatus status);

    List<GroupInvitation> findByGroupIdAndStatus(Long groupId, GroupInvitationStatus status);

    List<GroupInvitation> findByGroupIdAndDeadlineId(Long groupId, Integer deadlineId);

    List<GroupInvitation> findByStudentIdAndDeadlineId(Long studentId, Integer deadlineId);

    Optional<GroupInvitation> findByGroupIdAndStudentIdAndStatus(Long groupId, Long studentId, GroupInvitationStatus status);

    Optional<GroupInvitation> findFirstByGroupIdAndStudentIdAndStatusOrderByCreatedAtDesc(Long groupId, Long studentId, GroupInvitationStatus status);

    boolean existsByGroupIdAndStudentIdAndStatus(Long groupId, Long studentId, GroupInvitationStatus status);
}
