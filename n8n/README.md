# n8n document imports

Two workflow exports are included. Both use standard n8n nodes and an HTTP Header Auth credential reference. No credential values are in the exports.

- `import-document.json`: manual trigger → prepare a fictional text document → authenticated EvidenceDesk import.
- `webhook-document.json`: authenticated POST webhook → authenticated EvidenceDesk import → return the import result.

The HTTP node uses a 30-second timeout and retries failures up to three times. EvidenceDesk makes identical filename/version/access/content imports idempotent. A changed document needs a higher version; the same version with different content returns a conflict. Indexing happens in the separate worker; a 200 import response is an acceptance, not proof that indexing has completed.

## Setup

1. Run EvidenceDesk locally.
2. Import the workflow JSON in n8n using **Import from file**.
3. Create an **HTTP Header Auth** credential named **EvidenceDesk integration**, header name `X-Integration-Token`, value from the private local launcher's configuration. Assign it to the HTTP node and, for the webhook workflow, its trigger.
4. On the same computer, the API URL is `http://127.0.0.1:8090/api/integrations/documents`. If n8n is in Docker, replace it with a reachable private address such as `http://host.docker.internal:8090/...` on supported Docker Desktop systems. Do not expose the demo server publicly to make a connector reachable.
5. Execute the manual workflow. Check Library for `Automation guide.txt` and its real indexing state. Run again: the import response has `duplicate: true`.
6. Publish the webhook workflow. POST to its displayed production URL with the same authentication header and a JSON body:

```json
{
  "name": "Team notes.txt",
  "text": "Team notes\n\nThe catalog refresh runs at 02:00 UTC.",
  "version": 1,
  "visibility": "public"
}
```

Use n8n's credential manager. Never paste the token into a public workflow export, screenshots or GitHub. The integration is write-only; it cannot read staff documents or approve reviews. Google Drive and Slack nodes are possible future extensions and are not configured here.

## Reproduce the manual verification

With a local n8n installation, run:

```sh
python scripts/check_n8n.py --n8n-path /absolute/path/to/node_modules/n8n/bin/n8n
```

This imports credentials/workflows into an isolated ignored n8n data directory, executes the actual manual workflow twice, and checks that one document version exists. A temporary plaintext import credential file is deleted afterward; n8n retains its encrypted credential in the private directory. See the checked-in [execution report](../docs/validation/n8n.json) for actual manual and webhook verification results.

References: [n8n import/export documentation](https://docs.n8n.io/workflows/export-import/), [n8n CLI documentation](https://docs.n8n.io/hosting/cli-commands/).
