package com.fmaking.service.dto;

import java.util.List;

/** Internal trusted snapshot. Authorization and persistence belong to later API/application phases. */
public record AllocationSnapshotDTO(Integer classId, Integer deadlineId, List<GroupMemberDTO> students,
                                    List<GroupDTO> groups, List<GroupingRuleDTO> rules) {}
