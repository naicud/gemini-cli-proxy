# Troubleshooting 🔧

Common issues and solutions.

## Error Codes

### `401 Unauthorized`

**Cause**: The server has `PROXY_API_KEY` set, but your client didn't send
`Authorization: Bearer <key>`. **Fix**: Add the header to your client
configuration.

### `500 Internal Server Error` (auth failure)

**Cause**: The proxy tried to talk to Google but failed validation. **Fixes**:

- **API Key**: Check `GEMINI_API_KEY` is valid.
- **OAuth**: Your `~/.gemini` tokens might be expired. Refresh them locally by
  running `gemini` CLI login again, then re-deploy/restart.

### `Content generator not initialized`

**Cause**: Startup race condition or invalid config. **Fix**: Ensure at least
one auth method is valid (API Key OR OAuth file OR GCP Project). Check server
logs.

## Connection Issues

### "Connection Refused"

**Cause**: Docker port mapping issue or Firewall. **Fix**:

- Check `docker ps` to see if port 3000 is mapped.
- VPS Firewall: `ufw allow 3000`.

### "No inputs were found in config file"

**Cause**: TypeScript configuration issue in project root. **Fix**: Run
`npm install` and ensure `tsconfig.json` includes the correct paths.

## Debugging

Enable debug logs:

```bash
# In .env
LOG_LEVEL=debug
```

Or check Docker logs:

```bash
docker logs -f gemini-proxy
```
