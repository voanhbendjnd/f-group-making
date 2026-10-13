package tech.djnd.sample.app.web.rest;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.asm.ClassReader;
import org.springframework.asm.ClassVisitor;
import org.springframework.asm.ClassWriter;
import org.springframework.asm.MethodVisitor;
import org.springframework.asm.Opcodes;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableHandlerMethodArgumentResolver;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import tech.djnd.sample.app.domain.GroupingRuleCode;
import tech.djnd.sample.app.service.ClassRuleService;
import tech.djnd.sample.app.service.SchoolClassService;
import tech.djnd.sample.app.service.dto.ClassRulesDTO;
import tech.djnd.sample.app.service.dto.GroupingRuleDTO;
import tech.djnd.sample.app.service.dto.SaveClassRulesDTO;

import java.util.Arrays;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup;

class LecturerRequestBindingTest {
    @Test
    void assignedClassesBindOptionalFiltersWithoutCompilerParameterNames() throws Exception {
        var service = mock(SchoolClassService.class);
        Object controller = withoutParameterNames(LecturerClassResource.class, SchoolClassService.class, service);
        var paging = new PageableHandlerMethodArgumentResolver();
        paging.setOneIndexedParameters(true);
        MockMvc mvc = standaloneSetup(controller).setCustomArgumentResolvers(paging).build();
        mvc.perform(get("/api/me/school-classes").param("search", "SE1801").param("termId", "2")
                        .param("page", "2").param("size", "5"))
                .andExpect(status().isOk());
        verify(service).getMySchoolClasses(eq("SE1801"), eq(2), argThat(page -> page.getPageNumber() == 1 && page.getPageSize() == 5));
    }

    @Test
    void assignedClassesLoadWithAbsentOptionalFiltersWithoutCompilerParameterNames() throws Exception {
        var service = mock(SchoolClassService.class);
        Object controller = withoutParameterNames(LecturerClassResource.class, SchoolClassService.class, service);
        MockMvc mvc = standaloneSetup(controller).setCustomArgumentResolvers(new PageableHandlerMethodArgumentResolver()).build();
        mvc.perform(get("/api/me/school-classes")).andExpect(status().isOk());
        verify(service).getMySchoolClasses(isNull(), isNull(), any(Pageable.class));
    }

    @Test
    void ruleReadBindsClassIdWithoutCompilerParameterNames() throws Exception {
        var service = mock(ClassRuleService.class);
        when(service.getRules(42)).thenReturn(new ClassRulesDTO(42, 0, false, List.of(), List.of()));
        Object controller = withoutParameterNames(ClassRuleResource.class, ClassRuleService.class, service);
        standaloneSetup(controller).build().perform(get("/api/school-classes/42/rules"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.schoolClassId").value(42));
        verify(service).getRules(42);
    }

    @Test
    void ruleSaveBindsClassIdAndPayloadWithoutCompilerParameterNames() throws Exception {
        var service = mock(ClassRuleService.class);
        var rules = Arrays.stream(GroupingRuleCode.values())
                .map(code -> new GroupingRuleDTO(code, code.getSuggestedValue(), code != GroupingRuleCode.MIN_SE_MEMBERS_PER_GROUP)).toList();
        var request = new SaveClassRulesDTO(0L, rules);
        when(service.saveRules(42, request)).thenReturn(new ClassRulesDTO(42, 1, true, rules, List.of()));
        Object controller = withoutParameterNames(ClassRuleResource.class, ClassRuleService.class, service);
        standaloneSetup(controller).build().perform(put("/api/school-classes/42/rules")
                        .contentType(MediaType.APPLICATION_JSON).content(new ObjectMapper().writeValueAsString(request)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.version").value(1));
        verify(service).saveRules(42, request);
    }

    // Recreate the IDE/compiler scenario from the reported stack trace: neither
    // MethodParameters nor debug local-variable names are available to Spring.
    private Object withoutParameterNames(Class<?> resource, Class<?> serviceType, Object service) throws Exception {
        byte[] original;
        try (var stream = resource.getResourceAsStream("/" + resource.getName().replace('.', '/') + ".class")) {
            original = stream.readAllBytes();
        }
        var writer = new ClassWriter(0);
        new ClassReader(original).accept(new ClassVisitor(Opcodes.ASM9, writer) {
            @Override
            public MethodVisitor visitMethod(int access, String name, String descriptor, String signature, String[] exceptions) {
                return new MethodVisitor(Opcodes.ASM9, super.visitMethod(access, name, descriptor, signature, exceptions)) {
                    @Override
                    public void visitParameter(String name, int access) {
                        // Remove parameter-name metadata while retaining annotations.
                    }
                };
            }
        }, ClassReader.SKIP_DEBUG);
        byte[] stripped = writer.toByteArray();
        Class<?> type = new ClassLoader(resource.getClassLoader()) {
            Class<?> loadResource() { return defineClass(resource.getName(), stripped, 0, stripped.length); }
        }.loadResource();
        assertThat(Arrays.stream(type.getDeclaredMethods()).flatMap(method -> Arrays.stream(method.getParameters()))
                .noneMatch(java.lang.reflect.Parameter::isNamePresent)).isTrue();
        return type.getConstructor(serviceType).newInstance(service);
    }
}
