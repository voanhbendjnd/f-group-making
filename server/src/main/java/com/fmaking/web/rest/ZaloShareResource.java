package com.fmaking.web.rest;

import com.fmaking.service.ZaloShareService;
import com.fmaking.service.dto.ZaloShareDTO;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Positive;
import org.springframework.http.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import java.util.List;

@RestController
@RequestMapping("/api")
@Validated
public class ZaloShareResource {
    private final ZaloShareService service;
    public ZaloShareResource(ZaloShareService service) { this.service = service; }

    @GetMapping("/school-classes/{classId}/zalo-shares")
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN','ROLE_LECTURE','ROLE_LECTURE_MASTER')")
    public ResponseEntity<ZaloShareDTO> management(@PathVariable @Positive Integer classId, @RequestParam @Positive Integer termId) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.classShare(classId, termId));
    }

    @PutMapping(value = "/school-classes/{classId}/zalo-shares", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN','ROLE_LECTURE','ROLE_LECTURE_MASTER')")
    public ZaloShareDTO save(@PathVariable @Positive Integer classId, @RequestParam @Positive Integer termId,
        @Valid @RequestPart("data") ZaloShareDTO.Write request,
        @RequestPart(value = "qr", required = false) MultipartFile qr) {
        return service.saveClass(classId, termId, request, qr);
    }

    @DeleteMapping("/school-classes/{classId}/zalo-shares/{id}")
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN','ROLE_LECTURE','ROLE_LECTURE_MASTER')")
    public ResponseEntity<Void> delete(@PathVariable @Positive Integer classId, @PathVariable @Positive Long id,
        @RequestParam Long version, @RequestParam @Positive Integer termId) {
        service.deleteClass(classId, termId, id, version);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/lecturers/{lecturerId}/zalo-share")
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN','ROLE_LECTURE','ROLE_LECTURE_MASTER')")
    public ResponseEntity<ZaloShareDTO> lecturer(@PathVariable @Positive Long lecturerId, @RequestParam @Positive Integer termId) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.lecturerShare(lecturerId, termId));
    }

    @PutMapping(value = "/lecturers/{lecturerId}/zalo-share", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN','ROLE_LECTURE','ROLE_LECTURE_MASTER')")
    public ZaloShareDTO saveLecturer(@PathVariable @Positive Long lecturerId, @RequestParam @Positive Integer termId,
        @Valid @RequestPart("data") ZaloShareDTO.Write request, @RequestPart(value = "qr", required = false) MultipartFile qr) {
        return service.saveLecturer(lecturerId, termId, request, qr);
    }

    @DeleteMapping("/lecturers/{lecturerId}/zalo-share/{id}")
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN','ROLE_LECTURE','ROLE_LECTURE_MASTER')")
    public ResponseEntity<Void> deleteLecturer(@PathVariable @Positive Long lecturerId, @PathVariable @Positive Long id,
        @RequestParam Long version, @RequestParam @Positive Integer termId) {
        service.deleteLecturer(lecturerId, termId, id, version);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/me/zalo-shares")
    @PreAuthorize("hasAuthority('ROLE_STUDENT')")
    public ResponseEntity<List<ZaloShareDTO>> mine() {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.mine());
    }

    @GetMapping("/zalo-shares/{id}/qr")
    @PreAuthorize("hasAnyAuthority('ROLE_STUDENT','ROLE_ADMIN','ROLE_LECTURE','ROLE_LECTURE_MASTER')")
    public ResponseEntity<byte[]> qr(@PathVariable @Positive Long id) {
        var image = service.qr(id);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).header("X-Content-Type-Options", "nosniff")
            .contentType(MediaType.parseMediaType(image.contentType())).body(image.bytes());
    }
}
