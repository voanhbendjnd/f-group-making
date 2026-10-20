package com.fmaking.repository;

import com.fmaking.domain.GroupMember;
import com.fmaking.domain.GroupMemberRole;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface GroupMemberRepository extends JpaRepository<GroupMember, Long> {

    /** Include mis-scoped memberships so allocation refuses corrupt data instead of silently dropping it. */
    @Query("""
        select gm from GroupMember gm
        where (gm.schoolClassId = :classId and gm.deadlineId = :deadlineId)
           or gm.groupId in :groupIds
           or (gm.studentId in :studentIds and gm.deadlineId = :deadlineId)
        """)
    List<GroupMember> findAllocationMemberships(@Param("classId") Integer classId, @Param("deadlineId") Integer deadlineId,
        @Param("groupIds") List<Long> groupIds, @Param("studentIds") List<Long> studentIds);

    List<GroupMember> findByGroupId(Long groupId);

    List<GroupMember> findByStudentId(Long studentId);

    List<GroupMember> findByGroupIdIn(List<Long> groupIds);

    Optional<GroupMember> findByStudentIdAndDeadlineId(Long studentId, Integer deadlineId);

    Optional<GroupMember> findByGroupIdAndStudentId(Long groupId, Long studentId);

    long countByGroupId(Long groupId);

    List<GroupMember> findBySchoolClassIdAndDeadlineId(Integer schoolClassId, Integer deadlineId);

    void deleteByGroupIdAndStudentId(Long groupId, Long studentId);

    void deleteByGroupId(Long groupId);

    Optional<GroupMember> findByGroupIdAndRole(Long groupId, GroupMemberRole role);

    @Query("SELECT gm.studentId FROM GroupMember gm WHERE gm.schoolClassId = :classId AND gm.deadlineId = :deadlineId")
    List<Long> findAssignedStudentIds(@Param("classId") Integer classId, @Param("deadlineId") Integer deadlineId);
}
