# tilt2vote

Live voting by tilting your phone. Open the host screen, scan its QR code, and
tilt toward an option. The host can lock the votes and reopen the round.

- Production: https://tilt2vote.vercel.app
- Host screen: https://tilt2vote.vercel.app/host
- Interactive demo: https://tilt2vote.vercel.app/demo
- Repository: https://github.com/thibb-work/tilt2vote
- Vercel project: `thibblab/tilt2vote`

## Development

```bash
npm ci
cp .env.example .env.local
# Fill in the Firebase config and host credentials.
npm run dev
```

See [DEPLOY.md](DEPLOY.md) for deployment and phone checks. The existing Firebase
project keeps its original identifier; renaming the app does not migrate data.

## Verification

```bash
npm test
npm run lint
npm run build
```

See [test/e2e/README.md](test/e2e/README.md) for browser tests.
