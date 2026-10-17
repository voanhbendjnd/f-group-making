package com.fmaking.web.rest;

import com.fmaking.service.GroupService;
import com.fmaking.service.dto.*;
import com.fmaking.util.anotation.ApiMessage;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/deadlines/{deadlineId}/classes/{classId}/groups")
public class GroupResource {

    private final GroupService groupService;
    private final com.fmaking.service.GroupRecommendationService recommendationService;
    private final com.fmaking.service.GroupInvitationService invitationService;

    public GroupResource(GroupService groupService,
                         com.fmaking.service.GroupRecommendationService recommendationService,
                         com.fmaking.service.GroupInvitationService invitationService) {
        this.groupService = groupService;
        this.recommendationService = recommendationService;
        this.invitationService = invitationService;
    }

    @GetMapping("/{groupId}/recommended-students")
    @ApiMessage("Lấy danh sách gợi ý sinh viên cho nhóm thành công")
    public ResponseEntity<java.util.List<GroupMemberDTO>> getRecommendedStudents(
            @PathVariable("deadlineId") Integer deadlineId,
            @PathVariable("classId") Integer classId,
            @PathVariable("groupId") Long groupId) {
        return ResponseEntity.ok(recommendationService.recommendStudentsForGroup(groupId, classId, deadlineId));
    }

    @GetMapping("/recommended-groups")
    @ApiMessage("Lấy danh sách gợi ý nhóm phù hợp thành công")
    public ResponseEntity<java.util.List<GroupRecommendationDTO>> getRecommendedGroups(
            @PathVariable("deadlineId") Integer deadlineId,
            @PathVariable("classId") Integer classId) {
        return ResponseEntity.ok(recommendationService.recommendGroupsForCurrentStudent(classId, deadlineId));
    }

    @GetMapping("/workspace")
    @ApiMessage("Lấy dữ liệu không gian chọn nhóm thành công")
    public ResponseEntity<WorkspaceDTO> getWorkspace(
            @PathVariable("deadlineId") Integer deadlineId,
            @PathVariable("classId") Integer classId) {
        return ResponseEntity.ok(groupService.getWorkspace(deadlineId, classId));
    }

    @PostMapping
    @ApiMessage("Tạo nhóm mới thành công")
    public ResponseEntity<GroupDTO> createGroup(
            @PathVariable("deadlineId") Integer deadlineId,
            @PathVariable("classId") Integer classId,
            @Valid @RequestBody CreateGroupRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
            .body(groupService.createGroup(deadlineId, classId, request));
    }

    @PostMapping("/{groupId}/join")
    @ApiMessage("Tham gia nhóm thành công")
    public ResponseEntity<GroupDTO> joinGroup(
            @PathVariable("deadlineId") Integer deadlineId,
            @PathVariable("classId") Integer classId,
            @PathVariable("groupId") Long groupId) {
        return ResponseEntity.ok(groupService.joinGroup(deadlineId, classId, groupId));
    }

    @PostMapping("/{groupId}/leave")
    @ApiMessage("Rời nhóm thành công")
    public ResponseEntity<Void> leaveGroup(
            @PathVariable("deadlineId") Integer deadlineId,
            @PathVariable("classId") Integer classId,
            @PathVariable("groupId") Long groupId) {
        groupService.leaveGroup(deadlineId, classId, groupId);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{groupId}/transfer-leader")
    @ApiMessage("Chuyển quyền trưởng nhóm thành công")
    public ResponseEntity<GroupDTO> transferLeader(
            @PathVariable("deadlineId") Integer deadlineId,
            @PathVariable("classId") Integer classId,
            @PathVariable("groupId") Long groupId,
            @Valid @RequestBody TransferLeaderRequest request) {
        return ResponseEntity.ok(groupService.transferLeader(deadlineId, classId, groupId, request));
    }

    @PostMapping("/{groupId}/submit")
    @ApiMessage("Nộp danh sách nhóm thành công")
    public ResponseEntity<GroupDTO> submitGroup(
            @PathVariable("deadlineId") Integer deadlineId,
            @PathVariable("classId") Integer classId,
            @PathVariable("groupId") Long groupId) {
        return ResponseEntity.ok(groupService.submitGroup(deadlineId, classId, groupId));
    }

    @PostMapping("/{groupId}/cancel-submit")
    @ApiMessage("Hủy nộp danh sách nhóm thành công")
    public ResponseEntity<GroupDTO> cancelSubmitGroup(
            @PathVariable("deadlineId") Integer deadlineId,
            @PathVariable("classId") Integer classId,
            @PathVariable("groupId") Long groupId) {
        return ResponseEntity.ok(groupService.cancelSubmitGroup(deadlineId, classId, groupId));
    }

    @DeleteMapping("/{groupId}")
    @ApiMessage("Giải tán nhóm thành công")
    public ResponseEntity<Void> disbandGroup(
            @PathVariable("deadlineId") Integer deadlineId,
            @PathVariable("classId") Integer classId,
            @PathVariable("groupId") Long groupId) {
        groupService.disbandGroup(deadlineId, classId, groupId);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/lecturer-create")
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN', 'ROLE_LECTURE_MASTER', 'ROLE_LECTURE')")
    @ApiMessage("Giảng viên tạo và duyệt nhóm thành công")
    public ResponseEntity<GroupDTO> lecturerCreateGroup(
            @PathVariable("deadlineId") Integer deadlineId,
            @PathVariable("classId") Integer classId,
            @Valid @RequestBody LecturerCreateGroupRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
            .body(groupService.lecturerCreateGroup(deadlineId, classId, request));
    }

    @PostMapping("/{groupId}/submit-review")
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN', 'ROLE_LECTURE_MASTER', 'ROLE_LECTURE')")
    @ApiMessage("Group submitted for review")
    public ResponseEntity<GroupDTO> lecturerSubmit(@PathVariable("deadlineId") Integer deadlineId, @PathVariable("classId") Integer classId, @PathVariable("groupId") Long groupId) {
        return ResponseEntity.ok(groupService.lecturerSubmitGroup(deadlineId, classId, groupId));
    }

    @PostMapping("/{groupId}/move-member/{studentId}/to/{targetId}")
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN', 'ROLE_LECTURE_MASTER', 'ROLE_LECTURE')")
    @ApiMessage("Group member moved successfully")
    public ResponseEntity<GroupDTO> moveMember(@PathVariable("deadlineId") Integer deadlineId, @PathVariable("classId") Integer classId,
            @PathVariable("groupId") Long groupId, @PathVariable("studentId") Long studentId, @PathVariable("targetId") Long targetId) {
        return ResponseEntity.ok(groupService.lecturerMoveMember(deadlineId, classId, groupId, targetId, studentId));
    }

    @PostMapping("/{groupId}/accept")
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN', 'ROLE_LECTURE_MASTER', 'ROLE_LECTURE')")
    @ApiMessage("Phê duyệt nhóm thành công")
    public ResponseEntity<GroupDTO> acceptGroup(
            @PathVariable("deadlineId") Integer deadlineId,
            @PathVariable("classId") Integer classId,
            @PathVariable("groupId") Long groupId) {
        return ResponseEntity.ok(groupService.acceptGroup(deadlineId, classId, groupId));
    }

    @PostMapping("/{groupId}/reject")
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN', 'ROLE_LECTURE_MASTER', 'ROLE_LECTURE')")
    @ApiMessage("Từ chối nhóm thành công")
    public ResponseEntity<GroupDTO> rejectGroup(
            @PathVariable("deadlineId") Integer deadlineId,
            @PathVariable("classId") Integer classId,
            @PathVariable("groupId") Long groupId,
            @Valid @RequestBody RejectGroupRequest request) {
        return ResponseEntity.ok(groupService.rejectGroup(deadlineId, classId, groupId, request));
    }

    @PostMapping("/{groupId}/revoke")
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN', 'ROLE_LECTURE_MASTER', 'ROLE_LECTURE')")
    @ApiMessage("Thu hồi phê duyệt nhóm thành công")
    public ResponseEntity<GroupDTO> revokeGroup(
            @PathVariable("deadlineId") Integer deadlineId,
            @PathVariable("classId") Integer classId,
            @PathVariable("groupId") Long groupId) {
        return ResponseEntity.ok(groupService.revokeGroup(deadlineId, classId, groupId));
    }

    @PostMapping("/{groupId}/members/{studentId}")
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN', 'ROLE_LECTURE_MASTER', 'ROLE_LECTURE')")
    @ApiMessage("Giảng viên thêm sinh viên vào nhóm thành công")
    public ResponseEntity<GroupDTO> lecturerAddMember(
            @PathVariable("deadlineId") Integer deadlineId,
            @PathVariable("classId") Integer classId,
            @PathVariable("groupId") Long groupId,
            @PathVariable("studentId") Long studentId) {
        return ResponseEntity.ok(groupService.lecturerAddMember(deadlineId, classId, groupId, studentId));
    }

    @DeleteMapping("/{groupId}/members/{studentId}")
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN', 'ROLE_LECTURE_MASTER', 'ROLE_LECTURE')")
    @ApiMessage("Giảng viên xóa sinh viên khỏi nhóm thành công")
    public ResponseEntity<GroupDTO> lecturerRemoveMember(
            @PathVariable("deadlineId") Integer deadlineId,
            @PathVariable("classId") Integer classId,
            @PathVariable("groupId") Long groupId,
            @PathVariable("studentId") Long studentId) {
        return ResponseEntity.ok(groupService.lecturerRemoveMember(deadlineId, classId, groupId, studentId));
    }

    @PostMapping("/{groupId}/members/{studentId}/set-leader")
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN', 'ROLE_LECTURE_MASTER', 'ROLE_LECTURE')")
    @ApiMessage("Giảng viên chỉ định trưởng nhóm thành công")
    public ResponseEntity<GroupDTO> lecturerSetLeader(
            @PathVariable("deadlineId") Integer deadlineId,
            @PathVariable("classId") Integer classId,
            @PathVariable("groupId") Long groupId,
            @PathVariable("studentId") Long studentId) {
        return ResponseEntity.ok(groupService.lecturerSetLeader(deadlineId, classId, groupId, studentId));
    }

    @DeleteMapping("/{groupId}/lecturer-disband")
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN', 'ROLE_LECTURE_MASTER', 'ROLE_LECTURE')")
    @ApiMessage("Giảng viên giải tán nhóm thành công")
    public ResponseEntity<Void> lecturerDisbandGroup(
            @PathVariable("deadlineId") Integer deadlineId,
            @PathVariable("classId") Integer classId,
            @PathVariable("groupId") Long groupId) {
        groupService.lecturerDisbandGroup(deadlineId, classId, groupId);
        return ResponseEntity.noContent().build();
    }

    // ==========================================
    // GROUP INVITATION ENDPOINTS
    // ==========================================

    @GetMapping("/my-invitations")
    @ApiMessage("Lấy danh sách lời mời đang chờ thành công")
    public ResponseEntity<java.util.List<GroupInvitationDTO>> getMyPendingInvitations(
            @PathVariable("deadlineId") Integer deadlineId,
            @PathVariable("classId") Integer classId) {
        return ResponseEntity.ok(invitationService.getMyPendingInvitations(deadlineId, classId));
    }

    @GetMapping("/{groupId}/invitations")
    @ApiMessage("Lấy danh sách lời mời của nhóm thành công")
    public ResponseEntity<java.util.List<GroupInvitationDTO>> getGroupInvitations(
            @PathVariable("deadlineId") Integer deadlineId,
            @PathVariable("classId") Integer classId,
            @PathVariable("groupId") Long groupId) {
        return ResponseEntity.ok(invitationService.getGroupInvitations(deadlineId, classId, groupId));
    }

    @GetMapping("/{groupId}/search-invitees")
    @ApiMessage("Tìm kiếm sinh viên để mời vào nhóm thành công")
    public ResponseEntity<java.util.List<StudentSearchForInviteDTO>> searchStudentsForInvite(
            @PathVariable("deadlineId") Integer deadlineId,
            @PathVariable("classId") Integer classId,
            @PathVariable("groupId") Long groupId,
            @RequestParam(value = "query", required = false) String query) {
        return ResponseEntity.ok(invitationService.searchStudentsForInvite(deadlineId, classId, groupId, query));
    }

    @PostMapping("/{groupId}/invitations")
    @ApiMessage("Gửi lời mời tham gia nhóm thành công")
    public ResponseEntity<GroupInvitationDTO> sendInvitation(
            @PathVariable("deadlineId") Integer deadlineId,
            @PathVariable("classId") Integer classId,
            @PathVariable("groupId") Long groupId,
            @Valid @RequestBody SendInvitationRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(invitationService.sendInvitation(deadlineId, classId, groupId, request));
    }

    @PostMapping("/invitations/{invitationId}/accept")
    @ApiMessage("Chấp nhận lời mời tham gia nhóm thành công")
    public ResponseEntity<GroupDTO> acceptInvitation(
            @PathVariable("deadlineId") Integer deadlineId,
            @PathVariable("classId") Integer classId,
            @PathVariable("invitationId") Long invitationId) {
        return ResponseEntity.ok(invitationService.acceptInvitation(deadlineId, classId, invitationId));
    }

    @PostMapping("/invitations/{invitationId}/reject")
    @ApiMessage("Từ chối lời mời tham gia nhóm thành công")
    public ResponseEntity<Void> rejectInvitation(
            @PathVariable("deadlineId") Integer deadlineId,
            @PathVariable("classId") Integer classId,
            @PathVariable("invitationId") Long invitationId) {
        invitationService.rejectInvitation(deadlineId, classId, invitationId);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/invitations/{invitationId}")
    @ApiMessage("Hủy lời mời tham gia nhóm thành công")
    public ResponseEntity<Void> cancelInvitation(
            @PathVariable("deadlineId") Integer deadlineId,
            @PathVariable("classId") Integer classId,
            @PathVariable("invitationId") Long invitationId) {
        invitationService.cancelInvitation(deadlineId, classId, invitationId);
        return ResponseEntity.noContent().build();
    }
}

