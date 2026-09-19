---
title: Host first, with honest boundaries
description: Why 0.9.6 made Host execution the default without calling it a sandbox.
date: 2026-09-19
tags: [runtime, security, release]
---

Requiring Docker before a user can diagnose an Agent creates friction. Pretending direct execution is isolated creates risk. Version 0.9.6 chooses Host as the default and names the boundary precisely.

Host mode runs with the current user's permissions and environment. It supplies no container isolation, user switching, network policy or CPU/memory limits. Docker remains explicit opt-in when that boundary is required.

Execution environment becomes part of Context identity. A result produced on Host is not silently compared with Docker. Lower friction does not require weaker evidence—as long as the runtime difference remains visible.
