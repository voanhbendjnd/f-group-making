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

    public GroupResource(GroupService groupService) {
        this.groupService = groupService;
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
}
