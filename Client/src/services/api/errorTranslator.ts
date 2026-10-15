import i18n from '@/locales/i18n';

/**
 * Translates technical backend errors into user-friendly localized messages.
 * Never exposes raw HTTP 403, ConstraintViolationException, or SQL jargon to non-tech users.
 */
export function translateErrorMessage(error: any): string {
  if (!error) {
    return i18n.t('errors.unknown');
  }

  // If already an ApiError with translated or custom message
  const status = error.status || error.response?.status;
  const data = error.response?.data || error.data;

  // Check error key / title from Zalando Problem or custom exception
  const errorKey = data?.errorKey || data?.message || data?.title || data?.error;
  const detail = data?.detail;

  // Known backend error keys
  switch (errorKey) {
    case 'error.lecturerAssignmentConflict':
    case 'lecturerAssignmentConflict':
      return i18n.t('classAssignment.conflict');
    case 'error.lecturerNotFound':
    case 'lecturerNotFound':
      return i18n.t('classAssignment.lecturerNotFound');
    case 'termNotFound':
    case 'error.termNotFound':
      return i18n.t('terms.invalid');
    case 'userOutsideTerm':
    case 'error.userOutsideTerm':
    case 'lecturerOutsideTerm':
    case 'error.lecturerOutsideTerm':
      return i18n.t('terms.outsideScope');
    case 'error.classAccessDenied':
    case 'classAccessDenied':
      return i18n.t('rules.errors.classAccessDenied');
    case 'error.classNotFound':
    case 'classNotFound':
      return i18n.t('lecturer.classNotFound');
    case 'error.rulesVersionConflict':
    case 'rulesVersionConflict':
      return i18n.t('rules.errors.rulesVersionConflict');
    case 'error.duplicateRuleCode':
    case 'duplicateRuleCode':
      return i18n.t('rules.errors.duplicateRuleCode');
    case 'error.incompleteRules':
    case 'incompleteRules':
      return i18n.t('rules.errors.incompleteRules');
    case 'error.ruleMinGreaterThanMax':
    case 'ruleMinGreaterThanMax':
      return i18n.t('rules.minGreaterThanMax');
    case 'error.ruleMajorsExceedMembers':
    case 'ruleMajorsExceedMembers':
      return i18n.t('rules.majorsExceedMembers');
    case 'error.ruleSeExceedMembers':
    case 'ruleSeExceedMembers':
      return i18n.t('rules.seExceedMembers');
    case 'error.ruleValueOutOfRange':
    case 'ruleValueOutOfRange':
      return i18n.t('rules.errors.ruleValueOutOfRange');

    case 'error.emailnotfound':
    case 'emailnotfound':
      return i18n.t('errors.emailNotFound');

    case 'alreadyactivated':
    case 'error.alreadyactivated':
      return i18n.t('errors.alreadyActivated');

    case 'invalidactivationkey':
    case 'error.invalidactivationkey':
      return i18n.t('errors.invalidActivationKey');

    case 'resetkeyinvalidorexpired':
    case 'error.resetkeyinvalidorexpired':
      return i18n.t('errors.resetKeyInvalidOrExpired');

    case 'passwordlengthinvalid':
    case 'error.passwordlengthinvalid':
      return i18n.t('errors.passwordLengthInvalid');

    case 'error.idnotfound':
    case 'idnotfound':
      return i18n.t('errors.idNotFound');

    case 'invalidids':
    case 'error.invalidids':
      return i18n.t('errors.invalidIds');

    case 'studentnotfound':
      return i18n.t('errors.studentNotFound');

    case 'error.excel.invalid':
    case 'Excel file contains no student data.':
      return i18n.t('errors.excelInvalid');

    case 'Only .xlsx files are supported.':
      return i18n.t('errors.excelOnlyXlsx');

    case 'File must not be empty.':
      return i18n.t('errors.fileEmpty');

    case 'error.http.401':
    case 'Unauthorized':
      return i18n.t('errors.unauthorized');

    case 'error.http.403':
    case 'Access Denied':
    case 'error.donotpermission':
      return i18n.t('errors.accessDenied');

    case 'Bad credentials':
      return i18n.t('errors.badCredentials');

    case 'error.userexsist':
    case 'userexists':
      return i18n.t('errors.userExists');

    case 'error.ERR_GROUP_FULL':
    case 'ERR_GROUP_FULL':
      return i18n.t('groupFormation.errors.groupFull', 'Nhóm đã đủ số lượng thành viên tối đa.');

    case 'error.ERR_ALREADY_IN_GROUP':
    case 'ERR_ALREADY_IN_GROUP':
      return i18n.t('groupFormation.errors.alreadyInGroup', 'Bạn đã tham gia một nhóm khác trong đợt hạn này.');

    case 'error.ERR_GROUP_NAME_EXISTS':
    case 'ERR_GROUP_NAME_EXISTS':
      return i18n.t('groupFormation.errors.nameExists', 'Tên nhóm này đã tồn tại trong lớp học.');

    case 'error.ERR_GROUP_STATE_CONFLICT':
    case 'ERR_GROUP_STATE_CONFLICT':
      return i18n.t('groupFormation.errors.stateConflict', 'Thao tác không hợp lệ với trạng thái nhóm hiện tại.');

    case 'error.ERR_DEADLINE_CANCELLED':
    case 'ERR_DEADLINE_CANCELLED':
      return i18n.t('deadline.closed.CANCELLED.title');
    case 'error.ERR_DEADLINE_NOT_STARTED':
    case 'ERR_DEADLINE_NOT_STARTED':
      return i18n.t('deadline.closed.UPCOMING.title');
    case 'error.ERR_DEADLINE_EXPIRED':
    case 'ERR_DEADLINE_EXPIRED':
      return i18n.t('groupFormation.errors.deadlineExpired', 'Hạn chót chọn nhóm đã kết thúc.');

    case 'error.ERR_FORBIDDEN_NOT_LEADER':
    case 'ERR_FORBIDDEN_NOT_LEADER':
      return i18n.t('groupFormation.errors.notLeader', 'Chỉ Trưởng nhóm mới có quyền thực hiện thao tác này.');

    case 'error.ERR_FORBIDDEN_NOT_IN_CLASS':
    case 'ERR_FORBIDDEN_NOT_IN_CLASS':
      return i18n.t('groupFormation.errors.notInClass', 'Bạn không thuộc danh sách lớp học này.');

    case 'error.ERR_HARD_RULE_VIOLATED':
    case 'ERR_HARD_RULE_VIOLATED':
      return detail || i18n.t('groupFormation.errors.hardRuleViolated', 'Nhóm chưa thỏa mãn toàn bộ các quy tắc bắt buộc của lớp.');

    case 'error.ERR_SOFT_RULE_NOT_SATISFIED':
    case 'ERR_SOFT_RULE_NOT_SATISFIED':
      return detail || i18n.t('groupFormation.errors.softRuleNotSatisfied', 'Nhóm chưa đạt Soft Rules. Giảng viên bắt buộc phải nhập lý do ngoại lệ.');

    case 'error.ERR_LEADER_CANNOT_LEAVE':
    case 'ERR_LEADER_CANNOT_LEAVE':
      return i18n.t('groupFormation.errors.leaderCannotLeave', 'Trưởng nhóm phải chuyển quyền Leader cho thành viên khác trước khi rời nhóm.');

    case 'error.ERR_DISBAND_NOT_EMPTY':
    case 'ERR_DISBAND_NOT_EMPTY':
      return i18n.t('groupFormation.errors.disbandNotEmpty', 'Chỉ có thể giải tán nhóm khi nhóm không còn thành viên nào khác ngoài Leader.');

    default:
      break;
  }

  // Check specific status codes
  if (status === 401) {
    return i18n.t('errors.status401');
  }

  if (status === 403) {
    return i18n.t('errors.status403');
  }

  if (status === 404) {
    return i18n.t('errors.status404');
  }

  if (status === 413) {
    return i18n.t('errors.status413');
  }

  if (status >= 500) {
    return i18n.t('errors.status500');
  }

  if (detail && typeof detail === 'string' && !detail.includes('Exception') && !detail.includes('java.')) {
    return detail;
  }

  if (error.message && error.message.includes('Network Error')) {
    return i18n.t('errors.networkError');
  }

  return i18n.t('errors.generalFailure');
}
