package tech.djnd.sample.app.web.rest;

import jakarta.validation.Valid;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import tech.djnd.sample.app.security.AuthoritiesConstants;
import tech.djnd.sample.app.service.MajorService;
import tech.djnd.sample.app.service.dto.MajorDTO;
import tech.djnd.sample.app.service.dto.ResultPaginationDTO;
import tech.djnd.sample.app.util.anotation.ApiMessage;

import java.net.URI;

@RestController
@RequestMapping("/api/majors")
@PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.ADMIN + "\")")
public class MajorResource {

    private final MajorService majorService;

    public MajorResource(MajorService majorService) {
        this.majorService = majorService;
    }

    @PostMapping
    @ApiMessage("Create major successfully")
    public ResponseEntity<MajorDTO> createMajor(@Valid @RequestBody MajorDTO dto) {
        MajorDTO result = majorService.createMajor(dto);
        return ResponseEntity.created(URI.create("/api/majors/" + result.getId())).body(result);
    }

    @GetMapping
    @ApiMessage("Get major list successfully")
    public ResponseEntity<ResultPaginationDTO> getMajors(@RequestParam(name = "search", required = false) String search,
                                                        @RequestParam(name = "temporaryName", required = false) Boolean temporaryName,
                                                        @PageableDefault(sort = {"createdDate", "id"}, direction = Sort.Direction.DESC) Pageable pageable) {
        return ResponseEntity.ok(majorService.getMajors(search, temporaryName, pageable));
    }

    @GetMapping("/{id}")
    @ApiMessage("Get major details successfully")
    public ResponseEntity<MajorDTO> getMajorById(@PathVariable("id") Integer id) {
        return ResponseEntity.ok(majorService.getMajorById(id));
    }

    @PutMapping("/{id}")
    @ApiMessage("Update major successfully")
    public ResponseEntity<MajorDTO> updateMajor(@PathVariable("id") Integer id, @Valid @RequestBody MajorDTO dto) {
        return ResponseEntity.ok(majorService.updateMajor(id, dto));
    }

    @DeleteMapping("/{id}")
    @ApiMessage("Delete major successfully")
    public ResponseEntity<Void> deleteMajor(@PathVariable("id") Integer id) {
        majorService.deleteMajor(id);
        return ResponseEntity.noContent().build();
    }
}
