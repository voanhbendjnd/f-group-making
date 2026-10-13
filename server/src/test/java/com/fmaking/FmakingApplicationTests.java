package com.fmaking;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest(properties = {
		"djnd.client.base-url=http://localhost:3000",
		"djnd.client.allow-localhost=true"
})
class FmakingApplicationTests {

	@Test
	void contextLoads() {
	}

}
