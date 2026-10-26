package com.fmaking.service;

import com.fmaking.domain.*;
import com.fmaking.repository.*;
import com.fmaking.security.AuthoritiesConstants;
import com.fmaking.security.SecurityUtils;
import com.fmaking.service.dto.ZaloShareDTO;
import com.fmaking.service.dto.ZaloShareDTO.Write;
import com.fmaking.web.rest.errors.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.multipart.MultipartFile;
import java.util.*;

@Service
@Transactional(readOnly = true)
public class ZaloShareService {
    private final ZaloShareRepository shares;
    private final SchoolClassRepository classes;
    private final LecturerRepository lecturers;
    private final StudentRepository students;
    private final UserRepository users;
    private final TermRepository terms;
    private final SchoolClassAccessService access;
    private final ZaloQrStorage storage;
    private final GroupEventPublisher events;

    public ZaloShareService(ZaloShareRepository shares, SchoolClassRepository classes, LecturerRepository lecturers,
        StudentRepository students, UserRepository users, TermRepository terms, SchoolClassAccessService access,
        ZaloQrStorage storage, GroupEventPublisher events) {
        this.shares = shares; this.classes = classes; this.lecturers = lecturers; this.students = students;
        this.users = users; this.terms = terms; this.access = access; this.storage = storage; this.events = events;
    }

    public ZaloShareDTO classShare(Integer classId, Integer termId) {
        var target = classTarget(classId, termId, false);
        return shares.findByScopeKey(target.key()).map(share -> checkedDto(share, target)).orElse(null);
    }

    public ZaloShareDTO lecturerShare(Long lecturerId, Integer termId) {
        var target = lecturerTarget(lecturerId, termId, false);
        return shares.findByScopeKey(target.key()).map(share -> checkedDto(share, target)).orElse(null);
    }

    public List<ZaloShareDTO> mine() {
        var student = currentStudent();
        if (student.getSchoolClassId() == null) return List.of();
        var schoolClass = classes.findById(student.getSchoolClassId()).orElse(null);
        if (schoolClass == null || schoolClass.getTermId() == null) return List.of();
        var term = terms.findById(schoolClass.getTermId()).orElse(null);
        if (term == null) return List.of();
        var keys = new ArrayList<String>(); keys.add(classKey(schoolClass.getId()));
        if (schoolClass.getLecturerId() != null) keys.add(lecturerKey(schoolClass.getLecturerId(), term.getId()));
        var teacher = schoolClass.getLecturerId() == null ? null : users.findById(schoolClass.getLecturerId()).orElse(null);
        return shares.findByScopeKeyIn(keys).stream()
            .filter(share -> Objects.equals(share.getTermId(), term.getId()))
            .filter(share -> share.getScope() == ZaloShare.Scope.CLASS
                ? Objects.equals(share.getSchoolClassId(), schoolClass.getId()) && share.getLecturerId() == null
                : share.getSchoolClassId() == null && Objects.equals(share.getLecturerId(), schoolClass.getLecturerId()))
            .sorted(Comparator.comparing(share -> share.getScope() == ZaloShare.Scope.LECTURER ? 0 : 1))
            .map(share -> toDto(share, share.getScope() == ZaloShare.Scope.CLASS ? schoolClass : null, teacher, term)).toList();
    }

    @Transactional
    public ZaloShareDTO saveClass(Integer classId, Integer termId, Write request, MultipartFile qr) {
        return save(classTarget(classId, termId, true), request, qr);
    }

    @Transactional
    public ZaloShareDTO saveLecturer(Long lecturerId, Integer termId, Write request, MultipartFile qr) {
        return save(lecturerTarget(lecturerId, termId, true), request, qr);
    }

    private ZaloShareDTO save(Target target, Write request, MultipartFile qr) {
        if (request.scope() != target.scope()) throw ZaloShareValidation.invalid("zaloInvalidScope");
        String title = request.title() == null ? "" : request.title().trim();
        String description = request.description() == null ? null : request.description().trim();
        if (title.isBlank() || title.length() > 100 || (description != null && description.length() > 500)) throw ZaloShareValidation.invalid("zaloInvalidData");
        if (request.inviteUrl() == null || request.inviteUrl().length() > 512) throw ZaloShareValidation.invalid("zaloInvalidLink");
        String link = ZaloShareValidation.inviteUrl(request.inviteUrl());
        var image = ZaloShareValidation.image(qr);
        if (image != null && request.removeQr()) throw ZaloShareValidation.invalid("zaloInvalidData");
        var share = shares.findByScopeKey(target.key()).orElse(null);
        if (share != null) checkTarget(share, target);
        if ((share == null && request.version() != null) || (share != null && !Objects.equals(share.getVersion(), request.version()))) throw changed();
        if (share == null) {
            share = new ZaloShare(); share.setScope(target.scope()); share.setScopeKey(target.key());
            share.setTermId(target.term().getId());
            share.setSchoolClassId(target.schoolClass() == null ? null : target.schoolClass().getId());
            share.setLecturerId(target.scope() == ZaloShare.Scope.LECTURER ? target.teacher().getId() : null);
        }
        String oldPublicId = share.getQrPublicId();
        if (image != null) {
            String publicId = "fgroup/zalo/" + UUID.randomUUID();
            cleanup(publicId, false);
            storage.upload(image.bytes(), publicId, image.format());
            share.setQrPublicId(publicId); share.setQrFormat(image.format()); share.setQrBytes((long)image.bytes().length);
        } else if (request.removeQr()) {
            share.setQrPublicId(null); share.setQrFormat(null); share.setQrBytes(null);
        }
        share.setTitle(title); share.setInviteUrl(link); share.setDescription(description);
        share = shares.saveAndFlush(share);
        if (!Objects.equals(oldPublicId, share.getQrPublicId())) cleanup(oldPublicId, true);
        publish(target);
        return checkedDto(share, target);
    }

    @Transactional
    public void deleteClass(Integer classId, Integer termId, Long id, Long version) {
        delete(classTarget(classId, termId, true), id, version);
    }

    @Transactional
    public void deleteLecturer(Long lecturerId, Integer termId, Long id, Long version) {
        delete(lecturerTarget(lecturerId, termId, true), id, version);
    }

    private void delete(Target target, Long id, Long version) {
        var share = shares.findById(id).orElseThrow(ZaloShareService::missing);
        checkTarget(share, target);
        if (!Objects.equals(share.getVersion(), version)) throw changed();
        shares.delete(share); shares.flush(); cleanup(share.getQrPublicId(), true); publish(target);
    }

    public QrImage qr(Long id) {
        var share = shares.findById(id).orElseThrow(ZaloShareService::missing);
        if (isManager()) {
            var target = share.getScope() == ZaloShare.Scope.LECTURER
                ? lecturerTarget(share.getLecturerId(), share.getTermId(), false)
                : classTarget(share.getSchoolClassId(), share.getTermId(), false);
            checkTarget(share, target);
        } else {
            var student = currentStudent();
            var schoolClass = student.getSchoolClassId() == null ? null : classes.findById(student.getSchoolClassId()).orElse(null);
            if (schoolClass == null || !Objects.equals(schoolClass.getTermId(), share.getTermId()) || !terms.existsById(share.getTermId())) throw missing();
            if (share.getScope() == ZaloShare.Scope.CLASS) {
                if (!Objects.equals(share.getSchoolClassId(), schoolClass.getId()) || share.getLecturerId() != null) throw missing();
            } else if (share.getSchoolClassId() != null || schoolClass.getLecturerId() == null
                || !Objects.equals(share.getLecturerId(), schoolClass.getLecturerId())) throw missing();
        }
        if (share.getQrPublicId() == null) throw missing();
        return new QrImage(storage.read(share.getQrPublicId(), share.getQrFormat()), "image/" + ("jpg".equals(share.getQrFormat()) ? "jpeg" : share.getQrFormat()));
    }

    private Target classTarget(Integer classId, Integer termId, boolean lock) {
        requireManager();
        var schoolClass = (lock ? classes.findByIdForUpdate(classId) : classes.findById(classId)).orElseThrow(ZaloShareService::missing);
        access.requireWriteAccess(schoolClass);
        var term = requireTerm(termId);
        if (!Objects.equals(schoolClass.getTermId(), termId)) throw ZaloShareValidation.invalid("zaloInvalidScope");
        var teacher = schoolClass.getLecturerId() == null ? null : users.findById(schoolClass.getLecturerId()).orElse(null);
        return new Target(ZaloShare.Scope.CLASS, classKey(classId), schoolClass, teacher, term);
    }

    private Target lecturerTarget(Long lecturerId, Integer termId, boolean lock) {
        requireManager();
        if (lecturerId == null || (!SecurityUtils.isCurrentUserInRole(AuthoritiesConstants.ADMIN)
            && !Objects.equals(lecturerId, access.currentLecturerId()))) throw denied();
        var lecturer = (lock ? lecturers.findByIdForUpdate(lecturerId) : lecturers.findById(lecturerId)).orElseThrow(ZaloShareService::missing);
        var teacher = users.findById(lecturer.getUserId()).orElseThrow(ZaloShareService::missing);
        return new Target(ZaloShare.Scope.LECTURER, lecturerKey(lecturerId, termId), null, teacher, requireTerm(termId));
    }
    private Term requireTerm(Integer id) {
        if (id == null || id <= 0) throw ZaloShareValidation.invalid("zaloInvalidScope");
        return terms.findById(id).orElseThrow(ZaloShareService::missing);
    }
    private Student currentStudent() {
        if (!SecurityUtils.isCurrentUserInRole(AuthoritiesConstants.STUDENT)) throw denied();
        return SecurityUtils.getCurrentUserLogin().flatMap(users::findOneByEmail).flatMap(user -> students.findById(user.getId())).orElseThrow(ZaloShareService::denied);
    }
    private void requireManager() { if (!isManager()) throw denied(); }
    private boolean isManager() {
        return SecurityUtils.isCurrentUserInRole(AuthoritiesConstants.ADMIN) || SecurityUtils.isCurrentUserInRole(AuthoritiesConstants.LECTURE)
            || SecurityUtils.isCurrentUserInRole(AuthoritiesConstants.LECTURE_MASTER);
    }
    private void checkTarget(ZaloShare share, Target target) {
        if (!Objects.equals(share.getScopeKey(), target.key()) || share.getScope() != target.scope()
            || !Objects.equals(share.getTermId(), target.term().getId())
            || (target.scope() == ZaloShare.Scope.CLASS && (!Objects.equals(share.getSchoolClassId(), target.schoolClass().getId()) || share.getLecturerId() != null))
            || (target.scope() == ZaloShare.Scope.LECTURER && (!Objects.equals(share.getLecturerId(), target.teacher().getId()) || share.getSchoolClassId() != null))) throw missing();
    }
    private ZaloShareDTO checkedDto(ZaloShare share, Target target) {
        checkTarget(share, target); return toDto(share, target.schoolClass(), target.teacher(), target.term());
    }
    private ZaloShareDTO toDto(ZaloShare share, SchoolClass schoolClass, User teacher, Term term) {
        return new ZaloShareDTO(share.getId(), share.getSchoolClassId(), schoolClass == null ? null : schoolClass.getName(),
            teacher == null ? null : teacher.getId(), teacher == null ? null : teacher.getName(), term.getId(), term.getName(),
            share.getScope(), share.getTitle(), share.getInviteUrl(), share.getDescription(), share.getQrPublicId() != null,
            share.getVersion(), share.getLastModifiedDate());
    }
    private void publish(Target target) {
        if (target.schoolClass() != null) events.publish("ZALO_SHARE_UPDATED", null, null, target.schoolClass().getId(), null, null);
        else for (var schoolClass : classes.findByLecturerIdAndTermId(target.teacher().getId(), target.term().getId()))
            events.publish("ZALO_SHARE_UPDATED", null, null, schoolClass.getId(), null, null);
    }
    private static String classKey(Integer id) { return "CLASS:" + id; }
    private static String lecturerKey(Long id, Integer termId) { return "LECTURER:" + id + ":TERM:" + termId; }
    private void cleanup(String publicId, boolean afterCommit) {
        if (publicId == null) return;
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override public void afterCompletion(int status) {
                if ((afterCommit && status == STATUS_COMMITTED) || (!afterCommit && status == STATUS_ROLLED_BACK)) storage.deleteSafely(publicId);
            }
        });
    }
    private static RuntimeException missing() { return new NotFoundAlertException("Zalo sharing not found", "zaloShare", "zaloNotFound"); }
    private static RuntimeException denied() { return new ForbiddenAlertException("Zalo sharing access denied", "zaloShare", "zaloForbidden"); }
    private static RuntimeException changed() { return new ConflictAlertException("Zalo sharing changed; reload before editing", "zaloShare", "zaloConflict"); }
    private record Target(ZaloShare.Scope scope, String key, SchoolClass schoolClass, User teacher, Term term) {}
    public record QrImage(byte[] bytes, String contentType) {}
}
