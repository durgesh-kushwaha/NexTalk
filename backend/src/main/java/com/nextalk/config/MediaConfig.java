package com.nextalk.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class MediaConfig implements WebMvcConfigurer {

    @Value("${nextalk.media.root:${user.dir}/public}")
    private String mediaRoot;

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        String normalized = mediaRoot.endsWith("/") ? mediaRoot : mediaRoot + "/";
        registry.addResourceHandler("/media/**")
                .addResourceLocations("file:" + normalized);
    }
}