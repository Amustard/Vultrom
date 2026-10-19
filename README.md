# Vultrom

Fabric mod for Mason’s **Vultrom** Minecraft server (Minecraft **26.3**).

## Feature #1 — Security Guards

- Place a **Guard Post** (unmanned — no auto-spawn)
- Right-click the post to open a villager-like desk UI: Hire / duty / release / dismiss
- Hired guards use the vanilla villager model with a custom security uniform texture
- Per-post tone, patrol distance, area radius, and capture toggle
- Warn → search/confiscate → attack → MVP detain (hold at post)

## Build

Requires **JDK 25**.

```bash
export JAVA_HOME=/path/to/jdk-25
./gradlew build
```

Output jar: `build/libs/vultrom-0.1.0.jar`

## Dev run

```bash
./gradlew runClient
# or
./gradlew runServer
```
