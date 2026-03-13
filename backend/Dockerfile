FROM maven:3.9.11-eclipse-temurin-21 AS build
WORKDIR /app

COPY pom.xml ./
RUN mvn -q -DskipTests dependency:go-offline

COPY src ./src
COPY public ./public
RUN mvn -q -DskipTests clean package

FROM eclipse-temurin:21-jre
WORKDIR /app

COPY --from=build /app/target/*.jar app.jar
COPY --from=build /app/public ./public

RUN mkdir -p /app/public/avatars /app/public/chat-images

ENV PORT=7860
EXPOSE 7860

ENTRYPOINT ["sh", "-c", "java -Dserver.port=${PORT} -jar app.jar"]
