# MCP Server

This package serves an [OpenAPI](https://www.openapis.org/)-driven
[Model Context Protocol](https://modelcontextprotocol.io/) (MCP) endpoint at
`/mcp`. It exposes a curated, memo-focused toolset over the **Streamable HTTP**
transport using the official `github.com/modelcontextprotocol/go-sdk`.

The core design principle: **tool calls execute in-process against the existing
REST API.** The package owns no store or service logic of its own. Each tool is
derived from an operation in the generated OpenAPI document
(`proto/gen/openapi.yaml`, embedded via `proto.OpenAPIYAML()`), and a tool call
is translated into the matching `/api/v1/...` HTTP request and run against the
same Echo server that serves the public API. This keeps OpenAPI as the single
source of truth and reuses the API's authentication and authorization as-is.

## Integration

`server.NewServer` calls `mcp.NewMCPService` after registering the API, file, RSS, and gRPC-gateway routes, passing the same Echo server:

```go
mcpService, err := mcp.NewMCPService(profile, echoServer)
if err != nil {
    return nil, errors.Wrap(err, "failed to create MCP service")
}
mcpService.RegisterRoutes(echoServer)
```

The service advertises the **tools** capability only — no prompts, no resources.

## Startup flow

`NewMCPService` (`service.go`) wires everything up at construction time and fails
fast on any inconsistency:

1. `loadMCPServiceOpenAPISpec` parses the embedded `proto.OpenAPIYAML()` bytes
   into an `openAPISpec`.
2. `buildOperationRegistry` (`openapi.go`) indexes every operation by
   `operationId`, recording method, path, resolved request-body schema, and
   resolved 200 response schema.
3. `buildCuratedTools` (`catalog.go`) selects the allowlisted operation IDs and
   converts each into an `*sdkmcp.Tool` plus a `registeredOperation`. Missing
   IDs or duplicate tool names are construction errors.
4. Each tool is registered with `server.AddTool(tool, newMCPToolHandler(...))`.
5. `sdkmcp.NewStreamableHTTPHandler` wraps the server in stateless,
   JSON-response mode (no SSE, no session tracking).

## Request flow

`RegisterRoutes` binds `echoServer.Any("/mcp", ...)`. Each request:

1. `isAllowedMCPOrigin` (`origin.go`) rejects disallowed cross-origin browser requests with `403`.
2. The request body is capped at 256 MiB before the SDK reads it.
3. The SDK streamable handler dispatches the MCP message.
4. On a `tools/call` request, `newMCPToolHandler` (`service.go`) decodes the JSON
   arguments into a map.
5. `validateToolArguments` (`validation.go`) checks them against the tool's
   input schema.
6. The caller's `Authorization` header is read from the request (`request.Extra.Header` on the SDK's `*sdkmcp.CallToolRequest`).
7. For REST operations scoped by `/users/{user}`, the adapter calls
   `/api/v1/auth/me` with the same Authorization header and injects the
   authenticated user's resource name. MCP callers never pass a top-level
   `user` argument.
8. `apiAdapter.execute` (`adapter.go`) builds the API request
   (`buildAPIRequest`: path-parameter substitution, query encoding, JSON body),
   forwards the bearer token, and runs it against the Echo server through an
   `httptest.ResponseRecorder`.
9. The recorder body is decoded; a non-2xx status becomes a tool error
   (`newToolErrorResult`), otherwise the value is wrapped by
   `newStructuredToolResult`.

## Schema resolution

MCP tool schemas must be self-contained JSON Schema, but the OpenAPI components
use `$ref`. `openapi.go` resolves these into local definitions:

- **Top-level inlining.** The request-body and 200-response schemas for an
  operation are resolved with `inlineRef = true`, so the outermost `$ref` is
  expanded in place (`resolveSchemaRef` → `resolveSchemaValue` → `resolveSchemaMap`).
- **Nested refs become `$defs`.** Any `$ref` encountered below the top level is
  rewritten to a local `#/$defs/<Name>` pointer, and the referenced component is
  collected into a `$defs` map (`addSchemaDef`).
- **Cycle safety.** Recursive component schemas are handled by seeding
  `defs[name]` with a placeholder and tracking `resolving[name]` before
  recursing, so a schema that references itself terminates
  (`addSchemaDef`).

`catalog.go` then assembles the per-tool input schema in
`inputSchemaForOperation`:

- Path and query parameters become top-level properties; any required
  parameter stays in `required`. The transport-only `/users/{user}` path
  parameter is omitted because it is resolved from authentication at runtime.
- A request body becomes a single `body` property; a required body adds `body`
  to `required`. Body `$defs` are lifted to the schema's top-level `$defs`.
- Per-operation overrides relax resource-level requirements for create and
  partial-update bodies and remove fields already supplied by a path binding
  from `body: "*"` schemas. Memo updates may omit `updateMask` so the REST
  gateway can infer it from the fields present in the request body.
- Input-only schemas recursively remove `readOnly` fields and set
  `"additionalProperties": false` on message objects. Unknown fields therefore
  fail before dispatch instead of being silently ignored by protobuf JSON.

The output schema is the operation's 200 `application/json` schema. When a 200
response has no JSON body, the fallback is:

```json
{ "type": "object", "properties": { "ok": { "type": "boolean" } } }
```

## Endpoint, transport & auth

- **Endpoint:** `POST /mcp` (the SDK may also use `GET`/`DELETE` on the same
  path for the Streamable HTTP transport).
- **Transport:** Streamable HTTP, **stateless**, JSON responses.
- **Request size:** request bodies are limited to 256 MiB before SDK dispatch.
- **Auth:** the caller's `Authorization: Bearer <token>` header is forwarded to
  the in-process API request. Mutating tools therefore require a valid token
  (personal access token or access token); public reads may work without one,
  exactly as the REST API allows. User-scoped tools derive their user path from
  that authenticated identity and reject a caller-supplied top-level `user`.
- **Origin safety:** `isAllowedMCPOrigin` allows a request when the `Origin`
  header is absent (desktop clients commonly omit it), when its host matches
  the request `Host` header (host comparison only — scheme is not checked), or
  when it matches the configured `profile.InstanceURL`. Anything else gets
  `403`. This guards against DNS-rebinding from browsers.

### Connecting a client

Point any Streamable HTTP MCP client at `https://<your-instance>/mcp` and supply
a personal access token as a bearer credential. Example client config:

```json
{
  "mcpServers": {
    "memos": {
      "type": "http",
      "url": "https://<your-instance>/mcp",
      "headers": {
        "Authorization": "Bearer <your-personal-access-token>"
      }
    }
  }
}
```

## Tool surface

The server exposes a curated allowlist (`curatedOperationIDs` in `catalog.go`).
Every entry is intentionally scoped to a signed-in user's notes, reminders,
private finance ledger, personal settings, or read-only statistics. The only
auth operation is the read-only `AuthService_GetCurrentUser` ("whoami").

| OpenAPI operation | MCP tool | Purpose |
| --- | --- | --- |
| `MemoService_ListMemos` | `memo_list_memos` | Search and aggregate memos. |
| `MemoService_CreateMemo` | `memo_create_memo` | Create a memo. |
| `MemoService_GetMemo` | `memo_get_memo` | Read one memo. |
| `MemoService_UpdateMemo` | `memo_update_memo` | Update memo fields. |
| `MemoService_DeleteMemo` | `memo_delete_memo` | Delete a memo. |
| `MemoService_ListMemoComments` | `memo_list_memo_comments` | Read memo comments. |
| `MemoService_CreateMemoComment` | `memo_create_memo_comment` | Add a memo comment. |
| `MemoService_ListMemoAttachments` | `memo_list_memo_attachments` | Read a memo's attachment links. |
| `MemoService_SetMemoAttachments` | `memo_set_memo_attachments` | Replace a memo's attachments; omitted existing attachments are permanently deleted. |
| `MemoService_ListMemoReactions` | `memo_list_memo_reactions` | Read memo reactions. |
| `MemoService_UpsertMemoReaction` | `memo_upsert_memo_reaction` | Add or update a reaction. |
| `MemoService_DeleteMemoReaction` | `memo_delete_memo_reaction` | Remove a reaction. |
| `MemoService_ListMemoRelations` | `memo_list_memo_relations` | Read memo relations. |
| `MemoService_SetMemoRelations` | `memo_set_memo_relations` | Replace memo relations. |
| `AttachmentService_ListAttachments` | `attachment_list_attachments` | List the user's attachments. |
| `AttachmentService_CreateAttachment` | `attachment_create_attachment` | Upload an attachment. |
| `AttachmentService_GetAttachment` | `attachment_get_attachment` | Read attachment metadata/content. |
| `AttachmentService_DeleteAttachment` | `attachment_delete_attachment` | Delete an attachment. |
| `ShortcutService_ListShortcuts` | `shortcut_list_shortcuts` | Reuse saved CEL filters for memo queries. |
| `ReminderService_ListReminderLists` | `reminder_list_reminder_lists` | List the user's reminder lists. |
| `ReminderService_CreateReminderList` | `reminder_create_reminder_list` | Create a reminder list. |
| `ReminderService_UpdateReminderList` | `reminder_update_reminder_list` | Rename, reorder, or archive a reminder list. |
| `ReminderService_DeleteReminderList` | `reminder_delete_reminder_list` | Delete a reminder list. |
| `ReminderService_ListReminders` | `reminder_list_reminders` | Query reminders and completed items. |
| `ReminderService_CreateReminder` | `reminder_create_reminder` | Create a reminder using `remindTime` or date-only `dueDate` (there is no details field). |
| `ReminderService_UpdateReminder` | `reminder_update_reminder` | Update reminder details. |
| `ReminderService_DeleteReminder` | `reminder_delete_reminder` | Delete a reminder. |
| `ReminderService_CompleteReminder` | `reminder_complete_reminder` | Complete a reminder. |
| `ReminderService_ClearCompletedReminders` | `reminder_clear_completed_reminders` | Archive completed reminders in bulk. |
| `FinanceService_ListFinanceWallets` | `finance_list_finance_wallets` | List private wallets and balances. |
| `FinanceService_CreateFinanceWallet` | `finance_create_finance_wallet` | Create a private wallet; opening balance uses `initialBalanceMinor`. |
| `FinanceService_UpdateFinanceWallet` | `finance_update_finance_wallet` | Update wallet metadata or state. |
| `FinanceService_ListFinanceCategories` | `finance_list_finance_categories` | List income/expense categories. |
| `FinanceService_CreateFinanceCategory` | `finance_create_finance_category` | Create an income/expense category. |
| `FinanceService_UpdateFinanceCategory` | `finance_update_finance_category` | Update category metadata or state. |
| `FinanceService_ListFinanceTransactions` | `finance_list_finance_transactions` | Query ledger transactions. |
| `FinanceService_CreateFinanceTransaction` | `finance_create_finance_transaction` | Record income, expense, or a transfer; `occurTime` is required. |
| `FinanceService_UpdateFinanceTransaction` | `finance_update_finance_transaction` | Correct a ledger transaction and rebuild chronological balance snapshots. |
| `FinanceService_DeleteFinanceTransaction` | `finance_delete_finance_transaction` | Delete a ledger transaction and rebuild chronological balance snapshots. |
| `FinanceService_AdjustFinanceWalletBalance` | `finance_adjust_finance_wallet_balance` | Reconcile a wallet to an observed balance. |
| `FinanceService_GetFinanceSummary` | `finance_get_finance_summary` | Read balance, income, expense, net, and daily summaries. |
| `InstanceService_GetInstanceStats` | `instance_get_instance_stats` | Read admin-only instance resource statistics. |
| `UserService_GetUserStats` | `user_get_user_stats` | Read structured user memo, tag, and mood statistics. |
| `UserService_GetUserSetting` | `user_get_user_setting` | Read the caller's `GENERAL`, `TAGS`, or `PERSONA` setting (uppercase key). |
| `UserService_UpdateUserSetting` | `user_update_user_setting` | Update `GENERAL`, `TAGS`, or `PERSONA`; field masks use proto snake_case names. |
| `AuthService_GetCurrentUser` | `auth_get_current_user` | Resolve the authenticated user. |

The allowlist deliberately excludes sign-in/out and token refresh, user
administration, webhooks (including the generic user-setting path), personal access tokens, linked identities and SSO,
instance-setting mutation and email tests, public memo shares, and AI
transcription. Tests assert both the required workflow entries and these
negative security boundaries.

**Naming rule** (`toolNameFromOperationID`): drop the `Service` suffix from the
subject and convert both subject and method from camelCase to snake_case, joined
by `_`. So `MemoService_ListMemos → memo_list_memos`.

**Annotations** (`annotationsForOperation`) start from the HTTP method:

| Method | ReadOnly | Destructive | Idempotent |
| --- | --- | --- | --- |
| GET | true | false | true |
| DELETE | false | true | true |
| other (POST, PATCH, …) | false | false | false |

Per-operation overrides then correct cases the method heuristic gets wrong.
`MemoService_SetMemoAttachments` and `MemoService_SetMemoRelations` are PATCH
but declaratively replace the full set on a memo, so they report both
`IdempotentHint: true` and `DestructiveHint: true`. `MemoService_UpdateMemo`
also reports `DestructiveHint: true` because it can overwrite existing fields.

`OpenWorldHint` is `false` for all tools. Annotations are client hints; they do
not replace API authorization.

**Result shape.** Every successful result carries object-shaped `structuredContent`
(`normalizeStructuredContent` in `result.go`):

- a JSON object is returned unchanged;
- an empty response becomes `{ "ok": true }`;
- a bare array becomes `{ "result": [...] }`;
- a scalar becomes `{ "result": value }`.

This is deliberate: it fixes [#6022](https://github.com/usememos/memos/issues/6022),
where collection tools returned a bare array that strict MCP clients reject.

Inside that envelope the API's JSON is passed through verbatim, so the gateway's
own encoding is part of the tool contract: whatever it emits is validated against
the output schema resolved from the same OpenAPI spec. grpc-gateway's stock
marshaler emits `null` for unset message fields, which no schema declares as
nullable — `RegisterGateway` therefore installs a marshaler that omits them
(`newGatewayMarshaler` in `server/router/api/v1/v1.go`). That fixes
[#6139](https://github.com/usememos/memos/issues/6139), where `"motionMedia": null`
failed every tool call returning an attachment.

## Error handling

Failures are returned as MCP tool errors (`CallToolResult` with `IsError: true`
and a text content block), not JSON-RPC protocol errors — the handler returns
`(result, nil)`. Error results omit `structuredContent` so strict clients do not
validate an error payload against the tool's success-only output schema:

| Failure | Result |
| --- | --- |
| Arguments are not valid JSON | tool error: decode message |
| Arguments fail schema validation | tool error: validation message |
| Missing required path parameter | tool error: `missing required path parameter "..."` |
| Missing required request body | tool error: `missing required request body "body"` |
| API responds non-2xx | tool error: `"<code> <reason phrase>: <api message>"` (e.g. `"404 Not Found: ..."`) (`apiErrorMessage`) |
| API response body is not decodable JSON | tool error: decode message |

## Core files

| File | Responsibility |
| --- | --- |
| `service.go` | Constructs the MCP server, registers tools, builds the streamable HTTP handler, and binds the `/mcp` route. |
| `catalog.go` | The curated operation allowlist, tool naming, input/output schema assembly, and method-derived annotations. |
| `adapter.go` | Translates a tool call into an `/api/v1/...` request and runs it in-process against the Echo server. |
| `openapi.go` | Parses the OpenAPI spec, builds the operation registry, and resolves `$ref` schemas into self-contained JSON Schema. |
| `validation.go` | Validates tool-call arguments against the tool's input schema. |
| `origin.go` | `Origin`-header check for browser DNS-rebinding safety. |
| `result.go` | Normalizes API responses into object-shaped `structuredContent` and builds error results. |

## Adding a tool

1. Add the OpenAPI `operationId` to `curatedOperationIDs` in `catalog.go`.
2. If the operation is **not** in the generated OpenAPI, add or adjust the
   proto/API surface first, then regenerate:

   ```bash
   cd proto && buf generate
   ```

3. Extend the tests in `catalog_test.go` / `service_test.go` to cover the new
   tool.

Never hand-edit `proto/gen/openapi.yaml` or other generated output — change the
proto definitions and regenerate.

## Testing

```bash
go test ./server/router/mcp/...
```

- `openapi_test.go` — spec parsing, registry building, `$ref` resolution.
- `catalog_test.go` — tool selection, naming, schema and annotation building.
- `adapter_test.go` — request construction and in-process execution (`adapter.go`), plus result normalization and error shaping (`result.go`).
- `validation_test.go` — argument validation against input schemas.
- `service_test.go` — the origin-header check, plus the end-to-end MCP protocol
  (`initialize`, `tools/list`, `tools/call`) confirming object-shaped
  `structuredContent`.

## Design notes

- **Two-layer input validation.** `validateToolArguments` runs a hand-rolled
  structural check (`validateSchemaValue`) and then the `google/jsonschema-go`
  validator. The first yields friendly messages; the second is the
  spec-complete backstop.
- **Embedded vs. file load.** Production reads the spec from
  `proto.OpenAPIYAML()` (`loadMCPServiceOpenAPISpec`). The path-based
  `loadOpenAPISpec` in `openapi.go` exists for tests.
- **Tools only.** The server advertises no prompts or resources in this version.
