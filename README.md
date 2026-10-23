# txasm

txasm.org: the conference and abstract-management platform for the Texas Branch of the American Society for Microbiology. React Router 8 on Cloudflare Workers, with D1, R2, KV and Browser Rendering. Public repository.

How to work in this repo: `CLAUDE.md`. The nightly D1 backup and its restore: `app/lib/backup.server.ts` and the [d1-dump](https://github.com/DrDustinEdwards/d1-dump) README.

```sh
npm ci
npm run dev        # Vite in workerd, bindings local
npm run typecheck && npm run lint && npm test
```
