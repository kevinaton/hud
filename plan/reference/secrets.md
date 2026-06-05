## Role

Secrets management provides encrypted storage and secure access to credentials, API keys, and sensitive environment variables across all services. Never stored in `.env` files or committed to git.

## Design

### Why sops + age
- **sops** — editor-integrated encrypted secrets (YAML, JSON, ENV); age is a modern, minimal encryption tool with no dependencies
- Works with git — encrypted files can be committed; decrypted at runtime
- No server to maintain, no external dependency

### Secret categories

| Category | Examples | Store |
|---|---|---|
| API keys | OpenAI, Anthropic, Telegram bot token | sops-encrypted `.env` |
| Database | SQLite encryption key, Litestream S3 credentials | sops-encrypted `.env` |
| Cloudflare | Tunnel token, Access service token | sops-encrypted `.env` |
| Agent configs | Claude/Gemini API keys | sops-encrypted `.env` |
| Runtime secrets | Redis password, Caddy basic auth | sops-encrypted `.env` |
| Certificates | TLS certs (managed by Cloudflare) | Not needed |

### Connection model
- sops-encrypted files are committed to git (encrypted)
- Age key stored on the server only (never in git)
- Decrypted at boot via systemd `EnvironmentFile` or entrypoint script
- Agents and services read decrypted secrets as environment variables

### Secret rotation
- Rotate API keys: edit encrypted file, re-encrypt, push to git
- Rotate credentials: same process
- No server restart needed if services read from env on each run

## Ops Reference

### sops + age Setup

```bash
# Generate age key (one-time per server)
age-keygen -o /var/lib/command-center/age.key

# Encrypt a .env file
sops --encrypt --age <pubkey> --output .env.enc .env

# Decrypt for editing
sops --decrypt .env.enc > .env

# Encrypt with multiple keys (you + a backup key)
sops --encrypt --age <your-key>,<backup-key> --output .env.enc .env
```

### sops config (~/.config/sops/sops.yaml)

```yaml
creation_rules:
  - path_regex: .\.env\.enc$
    age: <your-age-pubkey>
```

### Environment Variables

```env
# sops (key path, not the key itself)
SOPS_AGE_KEY_FILE=/var/lib/command-center/age.key
```

### Key Storage

```
/var/lib/command-center/
├── age.key                    # age private key (chmod 600, never in git)
└── .env.enc                   # encrypted secrets (safe in git)
```

### Gitignore (enforced)

```
*.env
.env.*
.age
```

## Backup

- `age.key` — back up to Hetzner Storage Box or paper backup
- `.env.enc` — committed to git (encrypted)
- If lost: regenerate age key, re-encrypt all secrets

## Emergency Recovery

If decryption fails:
1. Restore `age.key` from backup
2. If key is lost: regenerate key, re-encrypt all `.env` files
3. Fall back to environment variables set manually in systemd unit