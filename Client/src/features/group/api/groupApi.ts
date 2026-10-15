import { apiClient } from '@/services/api/client';
import type {
  WorkspaceDTO,
  GroupDTO,
  CreateGroupRequest,
  LecturerCreateGroupRequest,
  TransferLeaderRequest,
  RejectGroupRequest,
} from '../types/groupTypes';

export const groupApi = {
  async getWorkspace(deadlineId: number, classId: number, signal?: AbortSignal): Promise<WorkspaceDTO> {
    const data = await apiClient.get<unknown, WorkspaceDTO>(
      `/api/deadlines/${deadlineId}/classes/${classId}/groups/workspace`,
      { signal }
    );
    return data;
  },

  async createGroup(deadlineId: number, classId: number, request: CreateGroupRequest): Promise<GroupDTO> {
    const data = await apiClient.post<unknown, GroupDTO>(
      `/api/deadlines/${deadlineId}/classes/${classId}/groups`,
      request
    );
    return data;
  },

  async joinGroup(deadlineId: number, classId: number, groupId: number): Promise<GroupDTO> {
    const data = await apiClient.post<unknown, GroupDTO>(
      `/api/deadlines/${deadlineId}/classes/${classId}/groups/${groupId}/join`
    );
    return data;
  },

  async leaveGroup(deadlineId: number, classId: number, groupId: number): Promise<void> {
    await apiClient.post(
      `/api/deadlines/${deadlineId}/classes/${classId}/groups/${groupId}/leave`
    );
  },

  async transferLeader(
    deadlineId: number,
    classId: number,
    groupId: number,
    request: TransferLeaderRequest
  ): Promise<GroupDTO> {
    const data = await apiClient.post<unknown, GroupDTO>(
      `/api/deadlines/${deadlineId}/classes/${classId}/groups/${groupId}/transfer-leader`,
      request
    );
    return data;
  },

  async submitGroup(deadlineId: number, classId: number, groupId: number): Promise<GroupDTO> {
    const data = await apiClient.post<unknown, GroupDTO>(
      `/api/deadlines/${deadlineId}/classes/${classId}/groups/${groupId}/submit`
    );
    return data;
  },

  async cancelSubmitGroup(deadlineId: number, classId: number, groupId: number): Promise<GroupDTO> {
    const data = await apiClient.post<unknown, GroupDTO>(
      `/api/deadlines/${deadlineId}/classes/${classId}/groups/${groupId}/cancel-submit`
    );
    return data;
  },

  async disbandGroup(deadlineId: number, classId: number, groupId: number): Promise<void> {
    await apiClient.delete(
      `/api/deadlines/${deadlineId}/classes/${classId}/groups/${groupId}`
    );
  },

  async lecturerCreateGroup(
    deadlineId: number,
    classId: number,
    request: LecturerCreateGroupRequest
  ): Promise<GroupDTO> {
    const data = await apiClient.post<unknown, GroupDTO>(
      `/api/deadlines/${deadlineId}/classes/${classId}/groups/lecturer-create`,
      request
    );
    return data;
  },

  async acceptGroup(deadlineId: number, classId: number, groupId: number): Promise<GroupDTO> {
    const data = await apiClient.post<unknown, GroupDTO>(
      `/api/deadlines/${deadlineId}/classes/${classId}/groups/${groupId}/accept`
    );
    return data;
  },

  async rejectGroup(
    deadlineId: number,
    classId: number,
    groupId: number,
    request: RejectGroupRequest
  ): Promise<GroupDTO> {
    const data = await apiClient.post<unknown, GroupDTO>(
      `/api/deadlines/${deadlineId}/classes/${classId}/groups/${groupId}/reject`,
      request
    );
    return data;
  },

  async revokeGroup(deadlineId: number, classId: number, groupId: number): Promise<GroupDTO> {
    const data = await apiClient.post<unknown, GroupDTO>(
      `/api/deadlines/${deadlineId}/classes/${classId}/groups/${groupId}/revoke`
    );
    return data;
  },

  async lecturerAddMember(
    deadlineId: number,
    classId: number,
    groupId: number,
    studentId: number
  ): Promise<GroupDTO> {
    const data = await apiClient.post<unknown, GroupDTO>(
      `/api/deadlines/${deadlineId}/classes/${classId}/groups/${groupId}/members/${studentId}`
    );
    return data;
  },

  async lecturerRemoveMember(
    deadlineId: number,
    classId: number,
    groupId: number,
    studentId: number
  ): Promise<GroupDTO> {
    const data = await apiClient.delete<unknown, GroupDTO>(
      `/api/deadlines/${deadlineId}/classes/${classId}/groups/${groupId}/members/${studentId}`
    );
    return data;
  },

  async lecturerSetLeader(
    deadlineId: number,
    classId: number,
    groupId: number,
    studentId: number
  ): Promise<GroupDTO> {
    const data = await apiClient.post<unknown, GroupDTO>(
      `/api/deadlines/${deadlineId}/classes/${classId}/groups/${groupId}/members/${studentId}/set-leader`
    );
    return data;
  },

  async lecturerDisbandGroup(
    deadlineId: number,
    classId: number,
    groupId: number
  ): Promise<void> {
    await apiClient.delete(
      `/api/deadlines/${deadlineId}/classes/${classId}/groups/${groupId}/lecturer-disband`
    );
  },
};

