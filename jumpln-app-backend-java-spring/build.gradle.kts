plugins {
	java
	id("org.springframework.boot") version "3.5.14"
	id("io.spring.dependency-management") version "1.1.7"
}

group = "tech"
version = "0.0.1-SNAPSHOT"

java {
	toolchain {
		languageVersion = JavaLanguageVersion.of(21)
	}
}

repositories {
	mavenCentral()
}

dependencies {
	implementation("org.springframework.boot:spring-boot-starter")
	runtimeOnly("com.mysql:mysql-connector-j")
	testImplementation("org.springframework.boot:spring-boot-starter-test")
	testImplementation("org.springframework.security:spring-security-test")
	testRuntimeOnly("org.junit.platform:junit-platform-launcher")
	implementation("io.jsonwebtoken:jjwt-api:0.11.5")
	runtimeOnly("io.jsonwebtoken:jjwt-impl:0.11.5")
	runtimeOnly("io.jsonwebtoken:jjwt-jackson:0.11.5")
	implementation("org.mapstruct:mapstruct:1.6.2")
	implementation("com.cloudinary:cloudinary-http5:2.0.0")
	annotationProcessor("org.mapstruct:mapstruct-processor:1.6.2")
	implementation("org.springframework.boot:spring-boot-starter-data-redis")
	implementation("org.apache.commons:commons-pool2")
	implementation("org.springframework.boot:spring-boot-starter-actuator")
	implementation("org.springframework.boot:spring-boot-starter-data-jpa")
	implementation("org.springframework.boot:spring-boot-starter-mail")
	implementation("org.springframework.boot:spring-boot-starter-security")
	implementation("org.springframework.boot:spring-boot-starter-oauth2-resource-server")
	implementation("org.springframework.boot:spring-boot-starter-thymeleaf")
	implementation("org.springframework.boot:spring-boot-starter-validation")
	implementation("org.springframework.boot:spring-boot-starter-web")
	implementation("org.thymeleaf.extras:thymeleaf-extras-springsecurity6")
	implementation("com.turkraft.springfilter:jpa:3.1.7")
	compileOnly("org.projectlombok:lombok")
	annotationProcessor("org.projectlombok:lombok")
	developmentOnly("org.springframework.boot:spring-boot-devtools")
	implementation("org.apache.poi:poi:5.2.5")
	implementation("org.apache.poi:poi-ooxml:5.2.5")
	implementation("org.apache.commons:commons-text:1.12.0")
	implementation("org.springframework.boot:spring-boot-starter-websocket")
	implementation("tech.jhipster:jhipster-framework:8.1.0")
	runtimeOnly("com.h2database:h2")
	// @enablecaching manage life
	implementation("org.springframework.boot:spring-boot-starter-cache")
	//jcache API (JSR-107):provide (javax.cache.* hoặc jakarta.cache.*)
	implementation("javax.cache:cache-api")
	// ehcache 3.x: manage ram and ttl
	implementation("org.ehcache:ehcache:3.10.8:jakarta")
	// connect hibernate 6 with jcache
	implementation("org.hibernate.orm:hibernate-jcache")
	// Response follow format RFC7807
	implementation("org.zalando:problem-spring-web-starter:0.29.1")
}

tasks.withType<Test> {
	useJUnitPlatform()
}
