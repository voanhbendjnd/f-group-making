use sqlx::MySqlPool;
use std::collections::{HashMap, HashSet};

use crate::domain::{GroupMemberRole, GroupStatus, GroupingRuleCode};
use crate::dto::group::{GroupMemberDTO, GroupRecommendationDTO};
use crate::dto::rule::GroupingRuleDTO;
use crate::dto::student::StudentDTO;
use crate::error::AppError;
use crate::repository::group_member_repository::GroupMemberRepository;
use crate::repository::group_repository::GroupRepository;
use crate::repository::student_repository::StudentRepository;
use crate::service::group_rule_validation_service::GroupRuleValidationService;

#[derive(Clone, Debug)]
pub struct StudentCandidate {
    pub user_id: i64,
    pub major_id: Option<i32>,
    pub major_code: Option<String>,
}

impl From<&StudentDTO> for StudentCandidate {
    fn from(s: &StudentDTO) -> Self {
        Self {
            user_id: s.user_id,
            major_id: s.major_id,
            major_code: s.major_code.clone(),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PolicyMatch {
    pub score: i32,
    pub reasons: Vec<String>,
}

#[derive(Hash, PartialEq, Eq, Clone, Copy, Debug)]
struct CandidateType {
    major_id: Option<i32>,
    se: bool,
}

#[derive(Clone, Copy, Debug)]
struct Availability {
    count: i32,
    se: i32,
}

#[derive(Hash, PartialEq, Eq, Clone, Copy, Debug)]
struct Completion {
    members: i32,
    se: i32,
    new_majors: i32,
}

pub struct GroupRecommendationPolicy {
    min_members: i32,
    max_members: i32,
    min_se: i32,
    min_majors: i32,
    max_majors: i32,
}

impl GroupRecommendationPolicy {
    pub fn new(rules: &[GroupingRuleDTO]) -> Self {
        Self {
            min_members: Self::bound(rules, GroupingRuleCode::MIN_MEMBERS_PER_GROUP, 0),
            max_members: Self::bound(rules, GroupingRuleCode::MAX_MEMBERS_PER_GROUP, i32::MAX),
            min_se: Self::bound(rules, GroupingRuleCode::MIN_SE_MEMBERS_PER_GROUP, 0),
            min_majors: Self::bound(rules, GroupingRuleCode::MIN_MAJORS_PER_GROUP, 0),
            max_majors: Self::bound(rules, GroupingRuleCode::MAX_MAJORS_PER_GROUP, i32::MAX),
        }
    }

    pub fn max_members(&self) -> i32 {
        self.max_members
    }

    fn bound(rules: &[GroupingRuleDTO], code: GroupingRuleCode, disabled: i32) -> i32 {
        rules
            .iter()
            .find(|r| r.code == code)
            .map(|r| if r.status { r.value } else { disabled })
            .unwrap_or_else(|| {
                if code.is_enabled_by_default() {
                    code.suggested_value()
                } else {
                    disabled
                }
            })
    }

    pub fn is_se(major_code: Option<&str>) -> bool {
        major_code
            .map(|c| c.trim().eq_ignore_ascii_case("SE"))
            .unwrap_or(false)
    }

    pub fn score_candidates(
        &self,
        members: &[StudentCandidate],
        member_count: usize,
        available: &[StudentCandidate],
        candidates: &[StudentCandidate],
    ) -> HashMap<i64, PolicyMatch> {
        if member_count as i32 >= self.max_members {
            return HashMap::new();
        }

        let mut counts: HashMap<i32, usize> = HashMap::new();
        for m in members {
            if let Some(mid) = m.major_id {
                *counts.entry(mid).or_insert(0) += 1;
            }
        }

        let se_count = members
            .iter()
            .filter(|m| Self::is_se(m.major_code.as_deref()))
            .count();

        let mut cache: HashMap<CandidateType, Option<PolicyMatch>> = HashMap::new();
        let mut matches: HashMap<i64, PolicyMatch> = HashMap::new();

        for candidate in candidates {
            let candidate_is_se = Self::is_se(candidate.major_code.as_deref());
            let c_type = CandidateType {
                major_id: candidate.major_id,
                se: candidate_is_se,
            };

            let matched = cache
                .entry(c_type)
                .or_insert_with(|| {
                    self.score(candidate, member_count, &counts, se_count, available)
                })
                .clone();

            if let Some(m) = matched {
                matches.insert(candidate.user_id, m);
            }
        }

        matches
    }

    fn score(
        &self,
        candidate: &StudentCandidate,
        member_count: usize,
        counts: &HashMap<i32, usize>,
        se_count: usize,
        available: &[StudentCandidate],
    ) -> Option<PolicyMatch> {
        let new_major = candidate
            .major_id
            .map(|mid| !counts.contains_key(&mid))
            .unwrap_or(false);

        let mut after_majors: HashSet<i32> = counts.keys().copied().collect();
        if let Some(mid) = candidate.major_id {
            after_majors.insert(mid);
        }

        let candidate_is_se = Self::is_se(candidate.major_code.as_deref());
        let new_se_count = se_count + if candidate_is_se { 1 } else { 0 };

        if after_majors.len() as i32 > self.max_majors
            || !self.can_complete(
                candidate,
                (member_count + 1) as i32,
                &after_majors,
                new_se_count as i32,
                available,
            )
        {
            return None;
        }

        let mut score = 30;
        let mut reasons = Vec::new();

        if (se_count as i32) < self.min_se && candidate_is_se {
            score += 35;
            reasons.push("Bổ sung sinh viên SE để đáp ứng số lượng SE tối thiểu".to_string());
        }

        if (counts.len() as i32) < self.min_majors && new_major {
            score += 5;
            reasons.push("Giúp nhóm đạt số ngành tối thiểu".to_string());
        }

        if let Some(mid) = candidate.major_id {
            let same_major = counts.get(&mid).copied().unwrap_or(0);
            score += (25.0 / (same_major as f64 + 1.0)).round() as i32;
            let code_str = candidate
                .major_code
                .as_deref()
                .map(|s| s.to_string())
                .unwrap_or_else(|| mid.to_string());
            reasons.push(if new_major {
                format!("Bổ sung ngành chưa có trong nhóm ({})", code_str)
            } else {
                format!(
                    "Cân bằng phân bổ ngành: nhóm hiện có {} thành viên cùng ngành",
                    same_major
                )
            });
        }

        if (member_count as i32) < self.min_members {
            score += 5;
            reasons.push(format!(
                "Giúp nhóm đạt sĩ số tối thiểu ({}/{})",
                member_count + 1,
                self.min_members
            ));
        }

        Some(PolicyMatch { score, reasons })
    }

    fn can_complete(
        &self,
        candidate: &StudentCandidate,
        count: i32,
        majors: &HashSet<i32>,
        se: i32,
        available: &[StudentCandidate],
    ) -> bool {
        let need_members = (self.min_members - count).max(0);
        let need_se = (self.min_se - se).max(0);
        let need_majors = (self.min_majors - majors.len() as i32).max(0);

        if need_members == 0 && need_se == 0 && need_majors == 0 {
            return true;
        }

        let slots = (self.max_members - count).min(need_members.max(need_se + need_majors));
        let new_major_limit = (self.max_majors - majors.len() as i32).min(slots);

        if slots < need_members.max(need_se.max(need_majors)) || new_major_limit < need_majors {
            return false;
        }

        let mut buckets: HashMap<Option<i32>, Availability> = HashMap::new();
        for student in available {
            if student.user_id == candidate.user_id {
                continue;
            }
            let is_se_val = if Self::is_se(student.major_code.as_deref()) {
                1
            } else {
                0
            };
            let entry = buckets
                .entry(student.major_id)
                .or_insert(Availability { count: 0, se: 0 });
            entry.count += 1;
            entry.se += is_se_val;
        }

        let total_count: i32 = buckets.values().map(|a| a.count).sum();
        let total_se: i32 = buckets.values().map(|a| a.se).sum();
        if total_count < need_members || total_se < need_se {
            return false;
        }

        let mut states: HashMap<Completion, i32> = HashMap::new();
        states.insert(
            Completion {
                members: 0,
                se: 0,
                new_majors: 0,
            },
            0,
        );

        for (bucket_major, supply) in &buckets {
            let new_major = bucket_major.is_some() && !majors.contains(&bucket_major.unwrap());
            let mut next: HashMap<Completion, i32> = HashMap::new();

            for (&before, &slots_used) in &states {
                let max_take = supply.count.min(slots - slots_used);
                for take in 0..=max_take {
                    let new_majors = before.new_majors + if new_major && take > 0 { 1 } else { 0 };
                    if new_majors > new_major_limit {
                        continue;
                    }
                    let least_se = 0.max(take - (supply.count - supply.se));
                    let max_se = take.min(supply.se);
                    for take_se in least_se..=max_se {
                        let after = Completion {
                            members: need_members.min(before.members + take),
                            se: need_se.min(before.se + take_se),
                            new_majors,
                        };
                        if after.members == need_members
                            && after.se == need_se
                            && after.new_majors >= need_majors
                        {
                            return true;
                        }
                        let new_cost = slots_used + take;
                        next.entry(after)
                            .and_modify(|c| *c = (*c).min(new_cost))
                            .or_insert(new_cost);
                    }
                }
            }
            states = next;
        }

        false
    }
}

pub struct GroupRecommendationService;

impl GroupRecommendationService {
    /// Rank unassigned students using the same policy as student-facing group suggestions.
    pub async fn recommend_students_for_group(
        pool: &MySqlPool,
        group_id: i64,
        school_class_id: i32,
        deadline_id: i32,
    ) -> Result<Vec<GroupMemberDTO>, AppError> {
        let group = GroupRepository::find_by_id(pool, group_id)
            .await?
            .ok_or_else(|| AppError::not_found("Group not found", "group", "groupNotFound"))?;

        if group.status != GroupStatus::OPEN.as_str() && group.status != GroupStatus::REVOKED.as_str() {
            return Ok(Vec::new());
        }

        let rules = GroupRuleValidationService::get_class_rules(pool, school_class_id).await?;
        let policy = GroupRecommendationPolicy::new(&rules);

        let group_members = GroupMemberRepository::find_by_group_id(pool, group_id).await?;
        if (group_members.len() as i32) >= policy.max_members() {
            return Ok(Vec::new());
        }

        let class_students =
            StudentRepository::find_students_by_school_class_id(pool, school_class_id).await?;
        let class_student_map: HashMap<i64, &StudentDTO> =
            class_students.iter().map(|s| (s.user_id, s)).collect();

        let all_deadline_members = GroupMemberRepository::find_by_school_class_id_and_deadline_id(
            pool,
            school_class_id,
            deadline_id,
        )
        .await?;
        let assigned_set: HashSet<i64> = all_deadline_members.iter().map(|m| m.student_id).collect();

        let available_students: Vec<&StudentDTO> = class_students
            .iter()
            .filter(|s| !assigned_set.contains(&s.user_id))
            .collect();

        let member_candidates: Vec<StudentCandidate> = group_members
            .iter()
            .filter_map(|gm| class_student_map.get(&gm.student_id))
            .map(|&s| StudentCandidate::from(s))
            .collect();

        let available_candidates: Vec<StudentCandidate> = available_students
            .iter()
            .map(|&s| StudentCandidate::from(s))
            .collect();

        let matches = policy.score_candidates(
            &member_candidates,
            group_members.len(),
            &available_candidates,
            &available_candidates,
        );

        let mut recommendations = Vec::new();
        for student in available_students {
            if let Some(m) = matches.get(&student.user_id) {
                recommendations.push(GroupMemberDTO {
                    id: 0,
                    group_id,
                    student_id: student.user_id,
                    roll_number: Some(student.roll_number.clone()),
                    full_name: Some(student.full_name.clone()),
                    email: Some(student.email.clone()),
                    member_code: student.member_code.clone(),
                    cohort: student.cohort.clone(),
                    slot_type: student.slot_type.clone(),
                    major_id: student.major_id,
                    major_code: student.major_code.clone(),
                    major_name: student.major_name.clone(),
                    role: GroupMemberRole::MEMBER,
                    joined_at: None,
                    self_description: student.self_description.clone(),
                    match_score: Some(m.score),
                    match_reasons: m.reasons.clone(),
                });
            }
        }

        recommendations.sort_by(|a, b| {
            b.match_score
                .cmp(&a.match_score)
                .then_with(|| match (&a.full_name, &b.full_name) {
                    (Some(na), Some(nb)) => na.cmp(nb),
                    (Some(_), None) => std::cmp::Ordering::Less,
                    (None, Some(_)) => std::cmp::Ordering::Greater,
                    (None, None) => std::cmp::Ordering::Equal,
                })
                .then_with(|| a.student_id.cmp(&b.student_id))
        });

        Ok(recommendations)
    }

    pub async fn recommend_groups_for_student(
        pool: &MySqlPool,
        student_id: i64,
        school_class_id: i32,
        deadline_id: i32,
    ) -> Result<Vec<GroupRecommendationDTO>, AppError> {
        StudentRepository::find_by_id(pool, student_id)
            .await?
            .ok_or_else(|| AppError::not_found("Student not found", "student", "studentNotFound"))?;

        let class_groups = GroupRepository::find_by_school_class_id_and_deadline_id(
            pool,
            school_class_id,
            deadline_id,
        )
        .await?;

        let rules = GroupRuleValidationService::get_class_rules(pool, school_class_id).await?;
        let policy = GroupRecommendationPolicy::new(&rules);

        let class_students =
            StudentRepository::find_students_by_school_class_id(pool, school_class_id).await?;
        let class_student_map: HashMap<i64, &StudentDTO> =
            class_students.iter().map(|s| (s.user_id, s)).collect();

        let all_members = GroupMemberRepository::find_by_school_class_id_and_deadline_id(
            pool,
            school_class_id,
            deadline_id,
        )
        .await?;
        let assigned_set: HashSet<i64> = all_members.iter().map(|m| m.student_id).collect();

        let available_students: Vec<&StudentDTO> = class_students
            .iter()
            .filter(|s| !assigned_set.contains(&s.user_id))
            .collect();

        let candidate_student = available_students
            .iter()
            .find(|s| s.user_id == student_id)
            .copied();

        let candidate_student = match candidate_student {
            Some(s) => s,
            None => return Ok(Vec::new()),
        };

        let candidate_slice = [StudentCandidate::from(candidate_student)];
        let available_candidates: Vec<StudentCandidate> = available_students
            .iter()
            .map(|&s| StudentCandidate::from(s))
            .collect();

        let mut members_by_group: HashMap<i64, Vec<&crate::domain::GroupMember>> = HashMap::new();
        for m in &all_members {
            members_by_group.entry(m.group_id).or_default().push(m);
        }

        let mut recommendations = Vec::new();

        for group in class_groups {
            if group.status != GroupStatus::OPEN.as_str() {
                continue;
            }

            let members = members_by_group.get(&group.id).cloned().unwrap_or_default();
            let member_candidates: Vec<StudentCandidate> = members
                .iter()
                .filter_map(|gm| class_student_map.get(&gm.student_id))
                .map(|&s| StudentCandidate::from(s))
                .collect();

            let matches = policy.score_candidates(
                &member_candidates,
                members.len(),
                &available_candidates,
                &candidate_slice,
            );

            if let Some(m) = matches.get(&student_id) {
                recommendations.push(GroupRecommendationDTO {
                    group_id: group.id,
                    group_name: group.name,
                    current_members: members.len(),
                    max_members: policy.max_members(),
                    match_score: m.score,
                    match_reasons: m.reasons.clone(),
                    is_eligible: true,
                });
            }
        }

        recommendations.sort_by(|a, b| {
            b.match_score
                .cmp(&a.match_score)
                .then_with(|| a.group_name.cmp(&b.group_name))
                .then_with(|| a.group_id.cmp(&b.group_id))
        });

        Ok(recommendations)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::GroupingRuleCode;

    fn student(id: i64, major: Option<i32>, code: Option<&str>) -> StudentCandidate {
        StudentCandidate {
            user_id: id,
            major_id: major,
            major_code: code.map(|s| s.to_string()),
        }
    }

    fn rule(code: GroupingRuleCode, value: i32, status: bool) -> GroupingRuleDTO {
        GroupingRuleDTO {
            code,
            value,
            status,
        }
    }

    #[test]
    fn keeps_rewarding_new_majors_after_the_minimum_is_met() {
        let policy = GroupRecommendationPolicy::new(&[]);
        let se = student(1, Some(1), Some("SE"));
        let eng = student(2, Some(2), Some("ENG"));
        let candidates = vec![
            student(3, Some(1), Some("SE")),
            student(4, Some(2), Some("ENG")),
            student(5, Some(3), Some("MKT")),
            student(6, Some(4), Some("GD")),
        ];
        let mut available_before = vec![eng.clone()];
        available_before.extend(candidates.clone());

        let before = policy.score_candidates(&[se.clone()], 1, &available_before, &available_before);
        assert!(before.get(&2).unwrap().score > before.get(&3).unwrap().score);

        let after = policy.score_candidates(&[se, eng], 2, &candidates, &candidates);
        assert_eq!(after.get(&5).unwrap().score, 60);
        assert!(after.get(&5).unwrap().score > after.get(&3).unwrap().score);
        assert_eq!(after.get(&3).unwrap().score, 48);
        assert_eq!(after.get(&4).unwrap().score, 48);
        assert_eq!(after.get(&5).unwrap().score, after.get(&6).unwrap().score);
    }

    #[test]
    fn favors_less_represented_majors() {
        let policy = GroupRecommendationPolicy::new(&[]);
        let members = vec![
            student(1, Some(1), Some("SE")),
            student(2, Some(1), Some("SE")),
            student(3, Some(2), Some("ENG")),
        ];
        let candidates = vec![
            student(4, Some(1), Some("SE")),
            student(5, Some(1), Some("SE")),
            student(6, Some(2), Some("ENG")),
            student(7, Some(3), Some("MKT")),
        ];
        let matches = policy.score_candidates(&members, 3, &candidates, &candidates);
        assert_eq!(matches.get(&4), matches.get(&5));
        assert!(matches.get(&7).unwrap().score > matches.get(&6).unwrap().score);
        assert!(matches.get(&6).unwrap().score > matches.get(&4).unwrap().score);
    }

    #[test]
    fn prioritizes_missing_se_without_clamping_candidates_to_the_same_score() {
        let policy = GroupRecommendationPolicy::new(&[rule(
            GroupingRuleCode::MIN_SE_MEMBERS_PER_GROUP,
            2,
            true,
        )]);
        let available = vec![
            student(2, Some(1), Some(" se ")),
            student(3, Some(2), Some("ENG")),
            student(4, Some(3), Some("MKT")),
        ];
        let matches = policy.score_candidates(
            &[student(1, Some(1), Some("SE"))],
            1,
            &available,
            &available,
        );
        assert!(matches.get(&2).unwrap().score > matches.get(&3).unwrap().score);
        for m in matches.values() {
            assert!(m.score >= 0 && m.score <= 100);
        }
    }

    #[test]
    fn reserves_the_last_seats_for_missing_se() {
        let policy = GroupRecommendationPolicy::new(&[
            rule(GroupingRuleCode::MAX_MEMBERS_PER_GROUP, 4, true),
            rule(GroupingRuleCode::MIN_SE_MEMBERS_PER_GROUP, 3, true),
        ]);
        let members = vec![
            student(1, Some(1), Some("SE")),
            student(2, Some(2), Some("ENG")),
        ];
        let available = vec![
            student(3, Some(1), Some("SE")),
            student(4, Some(1), Some("SE")),
            student(5, Some(3), Some("MKT")),
        ];
        let matches = policy.score_candidates(&members, 2, &available, &available);
        assert!(matches.contains_key(&3));
        assert!(matches.contains_key(&4));
        assert!(!matches.contains_key(&5));
    }

    #[test]
    fn lets_one_se_student_satisfy_both_se_and_diversity() {
        let policy = GroupRecommendationPolicy::new(&[
            rule(GroupingRuleCode::MAX_MEMBERS_PER_GROUP, 4, true),
            rule(GroupingRuleCode::MIN_MAJORS_PER_GROUP, 3, true),
            rule(GroupingRuleCode::MIN_SE_MEMBERS_PER_GROUP, 1, true),
        ]);
        let members = vec![
            student(1, Some(2), Some("ENG")),
            student(2, Some(2), Some("ENG")),
        ];
        let available = vec![
            student(3, Some(1), Some("SE")),
            student(4, Some(3), Some("MKT")),
            student(5, Some(2), Some("ENG")),
        ];
        let matches = policy.score_candidates(&members, 2, &available, &available);
        assert!(matches.contains_key(&3));
        assert!(matches.contains_key(&4));
        assert!(!matches.contains_key(&5));
        assert!(matches.get(&3).unwrap().score > matches.get(&4).unwrap().score);
    }

    #[test]
    fn respects_major_maximums_and_does_not_treat_an_unknown_major_as_diversity() {
        let rules = vec![
            rule(GroupingRuleCode::MIN_MEMBERS_PER_GROUP, 0, false),
            rule(GroupingRuleCode::MAX_MEMBERS_PER_GROUP, 2, true),
            rule(GroupingRuleCode::MAX_MAJORS_PER_GROUP, 1, true),
            rule(GroupingRuleCode::MIN_MAJORS_PER_GROUP, 2, false),
        ];
        let policy = GroupRecommendationPolicy::new(&rules);
        let members = vec![student(1, Some(1), Some("SE"))];
        let matches = policy.score_candidates(
            &members,
            1,
            &[
                student(2, Some(1), Some("SE")),
                student(3, Some(2), Some("ENG")),
                student(4, None, None),
            ],
            &[
                student(2, Some(1), Some("SE")),
                student(3, Some(2), Some("ENG")),
                student(4, None, None),
            ],
        );
        assert!(matches.contains_key(&2));
        assert!(matches.contains_key(&4));
        assert!(!matches.contains_key(&3));
        assert!(matches.get(&2).unwrap().score > matches.get(&4).unwrap().score);
    }

    #[test]
    fn disabled_rules_do_not_reserve_seats_or_award_minimum_bonuses() {
        let rules = GroupingRuleCode::all()
            .iter()
            .map(|code| rule(code.clone(), 999, false))
            .collect::<Vec<_>>();
        let members = vec![student(1, Some(1), Some("SE"))];
        let matches = GroupRecommendationPolicy::new(&rules).score_candidates(
            &members,
            1,
            &[student(2, Some(1), Some("SE")), student(3, Some(2), Some("ENG"))],
            &[student(2, Some(1), Some("SE")), student(3, Some(2), Some("ENG"))],
        );
        assert_eq!(matches.get(&2).unwrap().score, 43);
        assert_eq!(matches.get(&3).unwrap().score, 55);
    }
}
