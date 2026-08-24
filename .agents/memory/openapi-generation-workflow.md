---
name: OpenAPI generation workflow
description: Safe validation sequence after regenerating the typed API clients.
---

Regenerating the OpenAPI clients temporarily clears their generated source folders before writing replacements, so Vite can emit missing-module HMR errors during that short window.

**Why:** The transient errors look like broken frontend imports even though the regenerated files are valid once the command completes.

**How to apply:** After API code generation, wait for the generator and library typecheck to finish, restart the web workflow, and assess only the post-restart browser logs and production build.