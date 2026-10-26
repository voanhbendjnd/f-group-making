package com.fmaking.web.rest;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fmaking.domain.*;
import com.fmaking.repository.*;
import com.fmaking.service.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.context.transaction.TestTransaction;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockMultipartHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;
import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties={"spring.datasource.url=jdbc:h2:mem:zalo-refactor;DB_CLOSE_DELAY=-1;MODE=MySQL",
    "spring.jpa.properties.hibernate.cache.use_second_level_cache=false"})
@AutoConfigureMockMvc @Transactional
class ZaloShareResourceTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @Autowired UserRepository users;
    @Autowired LecturerRepository lecturers;
    @Autowired StudentRepository students;
    @Autowired SchoolClassRepository classes;
    @Autowired TermRepository terms;
    @Autowired MajorRepository majors;
    @Autowired GroupRepository groups;
    @Autowired GroupMemberRepository members;
    @MockitoSpyBean ZaloShareRepository shares;
    @MockitoBean ZaloQrStorage storage;
    @MockitoBean GroupEventPublisher events;
    @MockitoBean MailService mail;
    @MockitoBean NotificationAsyncService notifications;
    User teacher, outsider;
    Term term, oldTerm;
    List<SchoolClass> own;
    SchoolClass foreignClass, oldClass;
    List<User> studentUsers;
    User foreignStudent, oldStudent;
    Major major;

    @BeforeEach void fixture() {
        teacher=lecturer("Lecturer A"); outsider=lecturer("Lecturer B"); term=term(); oldTerm=term();
        major=new Major(); major.setCode("Z"+UUID.randomUUID().toString().substring(0,6)); major.setName("Major "+UUID.randomUUID()); major=majors.saveAndFlush(major);
        own=new ArrayList<>(); studentUsers=new ArrayList<>();
        for(int i=0;i<3;i++){var schoolClass=schoolClass(teacher,term);own.add(schoolClass);studentUsers.add(student(schoolClass));}
        foreignClass=schoolClass(outsider,term); foreignStudent=student(foreignClass);
        oldClass=schoolClass(teacher,oldTerm); oldStudent=student(oldClass);
        when(storage.read(anyString(),anyString())).thenReturn(new byte[]{1,2,3}); clearInvocations(storage,events);
    }
    User account(String name){var u=new User();u.setName(name);u.setEmail(UUID.randomUUID()+"@example.test");u.setActivated(true);return users.saveAndFlush(u);}
    User lecturer(String name){var u=account(name);var l=new Lecturer();l.setUserId(u.getId());l.setCode("L"+u.getId());lecturers.saveAndFlush(l);return u;}
    Term term(){var t=new Term();t.setName("T"+UUID.randomUUID().toString().substring(0,7));return terms.saveAndFlush(t);}
    SchoolClass schoolClass(User teacher,Term term){var c=new SchoolClass();c.setName("Class "+UUID.randomUUID().toString().substring(0,8));c.setLecturerId(teacher.getId());c.setTermId(term.getId());return classes.saveAndFlush(c);}
    User student(SchoolClass c){var u=account("Student");var s=new Student();s.setUserId(u.getId());s.setFullName(u.getName());s.setRollNumber("R"+u.getId());s.setMemberCode("M"+u.getId());s.setMajorId(major.getId());s.setSchoolClassId(c.getId());students.saveAndFlush(s);return u;}
    String classPath(){return "/api/school-classes/"+own.getFirst().getId()+"/zalo-shares";}
    String commonPath(){return "/api/lecturers/"+teacher.getId()+"/zalo-share";}
    String scoped(String path,Term t){return path+"?termId="+t.getId();}
    Map<String,Object> data(String scope,Long version){var d=new HashMap<String,Object>();d.put("scope",scope);d.put("version",version);d.put("title","  Zalo học tập  ");d.put("inviteUrl","  https://zalo.me/g/abc123  ");d.put("description","  Instructions  ");return d;}
    MockMultipartHttpServletRequestBuilder putData(String path,Term t,Map<String,Object> data)throws Exception{
        return (MockMultipartHttpServletRequestBuilder)multipart(scoped(path,t)).file(new MockMultipartFile("data","data.json","application/json",mapper.writeValueAsBytes(data)))
            .with(r->{r.setMethod("PUT");return r;});
    }
    MockMultipartFile image()throws Exception{var out=new ByteArrayOutputStream();ImageIO.write(new BufferedImage(8,8,BufferedImage.TYPE_INT_RGB),"png",out);return new MockMultipartFile("qr","qr.png","image/png",out.toByteArray());}
    ZaloShare create(String scope,boolean qr)throws Exception{
        String path=scope.equals("LECTURER")?commonPath():classPath();var req=putData(path,term,data(scope,null));if(qr)req.file(image());
        var result=mvc.perform(req.with(user(teacher.getEmail()).roles("LECTURE"))).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return shares.findById(mapper.readTree(result).path("data").path("id").asLong()).orElseThrow();
    }
    void expectMine(User u,int count)throws Exception{mvc.perform(get("/api/me/zalo-shares").with(user(u.getEmail()).roles("STUDENT"))).andExpect(status().isOk()).andExpect(jsonPath("$.data.length()").value(count));}

    @Test void oneLecturerShareIsVisibleToThreeClassesInSameTermWithoutAnyStudentGroups()throws Exception{
        long groupsBefore=groups.count(),membersBefore=members.count();var share=create("LECTURER",true);
        assertThat(share.getSchoolClassId()).isNull();assertThat(share.getLecturerId()).isEqualTo(teacher.getId());
        for(var u:studentUsers){expectMine(u,1);mvc.perform(get("/api/zalo-shares/"+share.getId()+"/qr").with(user(u.getEmail()).roles("STUDENT"))).andExpect(status().isOk());}
        expectMine(foreignStudent,0);expectMine(oldStudent,0);
        mvc.perform(get("/api/zalo-shares/"+share.getId()+"/qr").with(user(foreignStudent.getEmail()).roles("STUDENT"))).andExpect(status().isNotFound());
        mvc.perform(get("/api/zalo-shares/"+share.getId()+"/qr").with(user(oldStudent.getEmail()).roles("STUDENT"))).andExpect(status().isNotFound());
        assertThat(shares.findByScopeKey("LECTURER:"+teacher.getId()+":TERM:"+term.getId())).isPresent();
        assertThat(groups.count()).isEqualTo(groupsBefore);assertThat(members.count()).isEqualTo(membersBefore);
        verify(events,times(3)).publish(eq("ZALO_SHARE_UPDATED"),isNull(),isNull(),anyInt(),isNull(),isNull());
    }
    @Test void unconfiguredScopesReturnAnEmptyWrappedValue()throws Exception{
        mvc.perform(get(scoped(commonPath(),term)).with(user(teacher.getEmail()).roles("LECTURE"))).andExpect(status().isOk()).andExpect(jsonPath("$.data").isEmpty());
        mvc.perform(get(scoped(classPath(),term)).with(user(teacher.getEmail()).roles("LECTURE"))).andExpect(status().isOk()).andExpect(jsonPath("$.data").isEmpty());
    }
    @Test void classShareIsPrivateToThatClassAndReturnsRealTeacherClassAndTermNames()throws Exception{
        var share=create("CLASS",true);expectMine(studentUsers.getFirst(),1);expectMine(studentUsers.get(1),0);
        mvc.perform(get("/api/me/zalo-shares").with(user(studentUsers.getFirst().getEmail()).roles("STUDENT")))
            .andExpect(jsonPath("$.data[0].className").value(own.getFirst().getName()))
            .andExpect(jsonPath("$.data[0].lecturerName").value(teacher.getName())).andExpect(jsonPath("$.data[0].termName").value(term.getName()));
        mvc.perform(get("/api/zalo-shares/"+share.getId()+"/qr").with(user(studentUsers.get(1).getEmail()).roles("STUDENT"))).andExpect(status().isNotFound());
    }
    @Test void returnsAtMostLecturerAndClassSharesAndDoesNotExposeImageSecrets()throws Exception{
        create("LECTURER",true);create("CLASS",true);
        var response=mvc.perform(get("/api/me/zalo-shares").with(user(studentUsers.getFirst().getEmail()).roles("STUDENT")))
            .andExpect(header().string("Cache-Control","no-store")).andExpect(jsonPath("$.data.length()").value(2))
            .andReturn().getResponse().getContentAsString();
        assertThat(response).doesNotContain("groupId","qrPublicId","fgroup/zalo/","api_secret"); verifyNoInteractions(mail,notifications);
    }
    @Test void assignmentsChangeVisibilityImmediatelyAndClassSharingStaysWithClass()throws Exception{
        var common=create("LECTURER",true);var privateClass=create("CLASS",true);
        own.getFirst().setLecturerId(outsider.getId());classes.saveAndFlush(own.getFirst());
        expectMine(studentUsers.getFirst(),1);expectMine(studentUsers.get(1),1);
        mvc.perform(get("/api/zalo-shares/"+common.getId()+"/qr").with(user(studentUsers.getFirst().getEmail()).roles("STUDENT"))).andExpect(status().isNotFound());
        mvc.perform(get("/api/zalo-shares/"+privateClass.getId()+"/qr").with(user(studentUsers.getFirst().getEmail()).roles("STUDENT"))).andExpect(status().isOk());
        mvc.perform(get(scoped(classPath(),term)).with(user(teacher.getEmail()).roles("LECTURE"))).andExpect(status().isForbidden());
        mvc.perform(get(scoped(classPath(),term)).with(user(outsider.getEmail()).roles("LECTURE"))).andExpect(status().isOk());
        foreignClass.setLecturerId(teacher.getId());classes.saveAndFlush(foreignClass);expectMine(foreignStudent,1);
    }
    @Test void movingStudentToAnotherClassRevokesOldClassQrWithoutRequiringGroupMembership()throws Exception{
        var share=create("CLASS",true);var record=students.findById(studentUsers.getFirst().getId()).orElseThrow();record.setSchoolClassId(foreignClass.getId());students.saveAndFlush(record);
        expectMine(studentUsers.getFirst(),0);clearInvocations(storage);
        mvc.perform(get("/api/zalo-shares/"+share.getId()+"/qr").with(user(studentUsers.getFirst().getEmail()).roles("STUDENT"))).andExpect(status().isNotFound());
        verify(storage,never()).read(anyString(),anyString());
    }
    @Test void lecturerTermConfigurationsAreIndependent()throws Exception{
        create("LECTURER",false);
        mvc.perform(putData(commonPath(),oldTerm,data("LECTURER",null)).with(user(teacher.getEmail()).roles("LECTURE"))).andExpect(status().isOk());
        expectMine(oldStudent,1);expectMine(studentUsers.getFirst(),1);
        assertThat(shares.findByScopeKey("LECTURER:"+teacher.getId()+":TERM:"+oldTerm.getId())).isPresent();
    }
    @ParameterizedTest @ValueSource(strings={"LECTURE","LECTURE_MASTER"})
    void otherLecturerCannotReadEditDeleteOrDownloadAnotherLecturersCommonShare(String role)throws Exception{
        var share=create("LECTURER",true);
        mvc.perform(get(scoped(commonPath(),term)).with(user(outsider.getEmail()).roles(role))).andExpect(status().isForbidden());
        mvc.perform(putData(commonPath(),term,data("LECTURER",share.getVersion())).with(user(outsider.getEmail()).roles(role))).andExpect(status().isForbidden());
        mvc.perform(delete(scoped(commonPath()+"/"+share.getId(),term)).param("version",share.getVersion().toString()).with(user(outsider.getEmail()).roles(role))).andExpect(status().isForbidden());
        mvc.perform(get("/api/zalo-shares/"+share.getId()+"/qr").with(user(outsider.getEmail()).roles(role))).andExpect(status().isForbidden());
        mvc.perform(get(scoped(classPath(),term)).with(user(outsider.getEmail()).roles(role))).andExpect(status().isForbidden());
    }
    @Test void adminCanManageOtherLecturersButStudentAndUnauthenticatedCannot()throws Exception{
        mvc.perform(putData(commonPath(),term,data("LECTURER",null)).with(user(outsider.getEmail()).roles("ADMIN"))).andExpect(status().isOk());
        mvc.perform(get(scoped(classPath(),term)).with(user(studentUsers.getFirst().getEmail()).roles("STUDENT"))).andExpect(status().isForbidden());
        mvc.perform(putData(classPath(),term,data("CLASS",null)).with(user(studentUsers.getFirst().getEmail()).roles("STUDENT"))).andExpect(status().isForbidden());
        mvc.perform(get(scoped(commonPath(),term))).andExpect(status().isUnauthorized());
    }
    @Test void assignedMasterCanManageOwnCommonAndPrivateClassShare()throws Exception{
        mvc.perform(putData(commonPath(),term,data("LECTURER",null)).with(user(teacher.getEmail()).roles("LECTURE_MASTER"))).andExpect(status().isOk());
        mvc.perform(putData(classPath(),term,data("CLASS",null)).with(user(teacher.getEmail()).roles("LECTURE_MASTER"))).andExpect(status().isOk());
        expectMine(studentUsers.getFirst(),2);
    }
    @Test void checksScopeTermAndRemovedGroupEnum()throws Exception{
        mvc.perform(putData(classPath(),term,data("LECTURER",null)).with(user(teacher.getEmail()).roles("LECTURE"))).andExpect(status().isBadRequest());
        mvc.perform(putData(commonPath(),term,data("CLASS",null)).with(user(teacher.getEmail()).roles("LECTURE"))).andExpect(status().isBadRequest());
        mvc.perform(putData(classPath(),oldTerm,data("CLASS",null)).with(user(teacher.getEmail()).roles("LECTURE"))).andExpect(status().isBadRequest());
        mvc.perform(putData(classPath(),term,data("GROUP",null)).with(user(teacher.getEmail()).roles("LECTURE"))).andExpect(status().isBadRequest());
        mvc.perform(get(commonPath()).with(user(teacher.getEmail()).roles("LECTURE"))).andExpect(status().isBadRequest());
        mvc.perform(get(commonPath()).param("termId","2147483647").with(user(teacher.getEmail()).roles("LECTURE"))).andExpect(status().isNotFound());
    }
    @Test void trimVersionConflictAndDelete()throws Exception{
        var share=create("CLASS",false);assertThat(share.getTitle()).isEqualTo("Zalo học tập");
        mvc.perform(putData(classPath(),term,data("CLASS",null)).with(user(teacher.getEmail()).roles("LECTURE"))).andExpect(status().isConflict());
        mvc.perform(putData(classPath(),term,data("CLASS",share.getVersion())).with(user(teacher.getEmail()).roles("LECTURE"))).andExpect(status().isOk());
        var current=shares.findById(share.getId()).orElseThrow();
        mvc.perform(delete(scoped(classPath()+"/"+share.getId(),term)).param("version",current.getVersion().toString()).with(user(teacher.getEmail()).roles("LECTURE"))).andExpect(status().isNoContent());
        assertThat(shares.findById(share.getId())).isEmpty();
    }
    @Test void invalidLinkTitleImageNeverUploads()throws Exception{
        var invalid=data("CLASS",null);invalid.put("inviteUrl","https://evil.test/g/abc");mvc.perform(putData(classPath(),term,invalid).with(user(teacher.getEmail()).roles("LECTURE"))).andExpect(status().isBadRequest());
        invalid.put("inviteUrl","https://zalo.me/g/abc");invalid.put("title"," ");mvc.perform(putData(classPath(),term,invalid).with(user(teacher.getEmail()).roles("LECTURE"))).andExpect(status().isBadRequest());
        mvc.perform(putData(classPath(),term,data("CLASS",null)).file(new MockMultipartFile("qr","qr.png","image/png","invalid".getBytes())).with(user(teacher.getEmail()).roles("LECTURE"))).andExpect(status().isBadRequest());
        verify(storage,never()).upload(any(),anyString(),anyString());
    }
    @Test void uploadFailureRollsBackAndKeepsOldQr()throws Exception{
        var share=create("LECTURER",true);String old=share.getQrPublicId();TestTransaction.flagForCommit();TestTransaction.end();TestTransaction.start();clearInvocations(storage);
        doThrow(new IllegalStateException("simulated")).when(storage).upload(any(),anyString(),anyString());
        mvc.perform(putData(commonPath(),term,data("LECTURER",share.getVersion())).file(image()).with(user(teacher.getEmail()).roles("LECTURE"))).andExpect(status().is5xxServerError());
        TestTransaction.flagForRollback();TestTransaction.end();verify(storage).deleteSafely(argThat(id->!id.equals(old)));verify(storage,never()).deleteSafely(old);
    }
    @Test void databaseFailureAfterUploadCleansNewAsset()throws Exception{
        doThrow(new org.springframework.dao.DataIntegrityViolationException("simulated")).when(shares).saveAndFlush(any(ZaloShare.class));
        mvc.perform(putData(classPath(),term,data("CLASS",null)).file(image()).with(user(teacher.getEmail()).roles("LECTURE"))).andExpect(status().isConflict());
        TestTransaction.flagForRollback();TestTransaction.end();verify(storage).deleteSafely(anyString());
    }
    @Test void replacingOrRemovingQrCleansOldOnlyAfterCommit()throws Exception{
        var share=create("LECTURER",true);String old=share.getQrPublicId();TestTransaction.flagForCommit();TestTransaction.end();TestTransaction.start();clearInvocations(storage);
        var request=data("LECTURER",share.getVersion());request.put("removeQr",true);
        mvc.perform(putData(commonPath(),term,request).with(user(teacher.getEmail()).roles("LECTURE"))).andExpect(status().isOk()).andExpect(jsonPath("$.data.hasQr").value(false));
        verify(storage,never()).deleteSafely(anyString());TestTransaction.flagForCommit();TestTransaction.end();verify(storage).deleteSafely(old);
    }
}
