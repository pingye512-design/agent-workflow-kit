# Security

## Public snapshot

The `apps/` tree is a sanitized source snapshot. It must not contain production credentials, employee or customer records, platform user IDs, private endpoints, local user paths, databases, logs, or packaged user state.

Run the release scan before every public commit:

```powershell
powershell -File scripts/scan-public-release.ps1
```

## Desktop trust boundary

The Electron preload bridge exposes local capabilities to the configured web UI. Only use a web origin you control and audit. Treat a compromised `RB_APP_URL` as equivalent to a compromised desktop application.

## Reporting

Use GitHub's private security advisory flow for vulnerabilities. Do not open a public issue containing secrets, personal data, or production infrastructure details.
