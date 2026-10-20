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

Output jar: `build/libs/vultrom-0.1.1.jar`

## Custom guard sounds

Yes — you can use your own villager-style clips. See  
`src/main/resources/assets/vultrom/sounds/entity/security_guard/README.txt`.

Defaults use vanilla villager voices via `sounds.json`.

## Testing enforcement

Creative / spectator players are ignored for search/detain. Use **survival** with TNT or flint & steel near a post that has **Capture ON**. Hitting a guard makes them chase past patrol bounds until they lose line of sight.

## Dev run

```bash
./gradlew runClient
# or
./gradlew runServer
```
