package mcp

import (
	"encoding/json"
	"strings"
	"testing"

	sdkmcp "github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/stretchr/testify/require"
)

func requireJSONSchema(t *testing.T, value any) jsonSchema {
	t.Helper()
	schema, ok := value.(jsonSchema)
	require.True(t, ok)
	return schema
}

func TestCuratedOperationIDsStayPersonalDataFocused(t *testing.T) {
	require.Len(t, curatedOperationIDs, 49)
	allowedUserOperations := map[string]bool{
		"UserService_GetUserStats":      true,
		"UserService_GetUserSetting":    true,
		"UserService_UpdateUserSetting": true,
	}
	allowedInstanceOperations := map[string]bool{
		"InstanceService_GetInstanceStats":      true,
		"InstanceService_GetMemoMoodDisplay":    true,
		"InstanceService_UpdateMemoMoodDisplay": true,
	}

	for _, operationID := range curatedOperationIDs {
		require.NotContains(t, operationID, "Admin")
		// AuthService_GetCurrentUser is the single allowed auth op (read-only
		// "whoami"); the rest of the auth/identity surface stays off MCP.
		if operationID != "AuthService_GetCurrentUser" {
			require.NotContains(t, operationID, "AuthService_")
		}
		if strings.HasPrefix(operationID, "UserService_") {
			require.True(t, allowedUserOperations[operationID], operationID)
		}
		require.NotContains(t, operationID, "AIService_")
		require.NotContains(t, operationID, "IdentityProviderService_")
		if strings.HasPrefix(operationID, "InstanceService_") {
			require.True(t, allowedInstanceOperations[operationID], operationID)
		}
		require.NotContains(t, operationID, "PersonalAccessToken")
		require.NotContains(t, operationID, "PAT")
		require.NotContains(t, operationID, "Webhook")
		require.NotContains(t, operationID, "Share")
		require.NotContains(t, operationID, "BatchDelete")
		require.NotContains(t, operationID, "Transcribe")
	}
}

func TestCuratedOperationIDsIncludeRequiredPersonalWorkflows(t *testing.T) {
	curated := make(map[string]bool, len(curatedOperationIDs))
	for _, operationID := range curatedOperationIDs {
		curated[operationID] = true
	}
	for _, operationID := range []string{
		"MemoService_SetMemoMood",
		"ReminderService_UpdateReminderList",
		"ReminderService_DeleteReminderList",
		"ReminderService_DeleteReminder",
		"ReminderService_ClearCompletedReminders",
		"FinanceService_ListFinanceWallets",
		"FinanceService_CreateFinanceWallet",
		"FinanceService_UpdateFinanceWallet",
		"FinanceService_ListFinanceCategories",
		"FinanceService_CreateFinanceCategory",
		"FinanceService_UpdateFinanceCategory",
		"FinanceService_ListFinanceTransactions",
		"FinanceService_CreateFinanceTransaction",
		"FinanceService_UpdateFinanceTransaction",
		"FinanceService_DeleteFinanceTransaction",
		"FinanceService_AdjustFinanceWalletBalance",
		"FinanceService_GetFinanceSummary",
		"InstanceService_GetInstanceStats",
		"InstanceService_GetMemoMoodDisplay",
		"InstanceService_UpdateMemoMoodDisplay",
		"UserService_GetUserStats",
		"UserService_GetUserSetting",
		"UserService_UpdateUserSetting",
	} {
		require.True(t, curated[operationID], operationID)
	}
}

func TestUserScopedToolsOmitTransportUserArgument(t *testing.T) {
	spec, err := loadOpenAPISpec("../../../proto/gen/openapi.yaml")
	require.NoError(t, err)
	registry, err := buildOperationRegistry(spec)
	require.NoError(t, err)

	for _, operationID := range curatedOperationIDs {
		apiOperation := registry[operationID]
		tool, operation := buildToolFromOperation(apiOperation)
		properties := schemaProperties(requireJSONSchema(t, tool.InputSchema)["properties"])
		if usesImplicitCurrentUser(apiOperation) {
			require.True(t, operation.ImplicitCurrentUser, operationID)
			require.NotContains(t, properties, "user", operationID)
		} else {
			require.False(t, operation.ImplicitCurrentUser, operationID)
		}
	}
}

func TestCuratedOperationIDsKeepDangerousSurfaceClosed(t *testing.T) {
	curated := make(map[string]bool, len(curatedOperationIDs))
	for _, operationID := range curatedOperationIDs {
		curated[operationID] = true
	}
	for _, operationID := range []string{
		"AuthService_SignIn",
		"AuthService_SignOut",
		"AuthService_RefreshToken",
		"UserService_CreateUser",
		"UserService_UpdateUser",
		"UserService_DeleteUser",
		"UserService_CreatePersonalAccessToken",
		"UserService_CreateUserWebhook",
		"UserService_CreateLinkedIdentity",
		"InstanceService_UpdateInstanceSetting",
		"InstanceService_TestInstanceEmailSetting",
		"MemoService_CreateMemoShare",
		"AIService_Transcribe",
	} {
		require.False(t, curated[operationID], operationID)
	}
}

func TestToolNameFromOperationID(t *testing.T) {
	require.Equal(t, "memo_list_memos", toolNameFromOperationID("MemoService_ListMemos"))
	require.Equal(t, "attachment_get_attachment", toolNameFromOperationID("AttachmentService_GetAttachment"))
}

func TestBuildToolFromOperationIncludesSchemasAndMetadata(t *testing.T) {
	spec, err := loadOpenAPISpec("../../../proto/gen/openapi.yaml")
	require.NoError(t, err)
	registry, err := buildOperationRegistry(spec)
	require.NoError(t, err)

	tool, operation := buildToolFromOperation(registry["MemoService_ListMemos"])
	require.Equal(t, "memo_list_memos", tool.Name)
	require.Equal(t, "Memo List Memos", tool.Title)
	require.Equal(t, "MemoService_ListMemos", operation.OperationID)
	require.Equal(t, "GET", operation.Method)
	require.Equal(t, "/api/v1/memos", operation.Path)
	require.Equal(t, "MemoService_ListMemos", tool.Meta["operationId"])
	require.Equal(t, "GET", tool.Meta["method"])
	require.Equal(t, "/api/v1/memos", tool.Meta["path"])
	require.NotEmpty(t, tool.Description)
	require.NotNil(t, tool.InputSchema)
	require.NotNil(t, tool.OutputSchema)
	require.NotNil(t, tool.Annotations)
	require.True(t, tool.Annotations.ReadOnlyHint)
	require.False(t, *tool.Annotations.DestructiveHint)
	require.True(t, tool.Annotations.IdempotentHint)
	require.False(t, *tool.Annotations.OpenWorldHint)

	inputBytes, err := json.Marshal(tool.InputSchema)
	require.NoError(t, err)
	require.Contains(t, string(inputBytes), `"pageSize"`)
	require.Contains(t, string(inputBytes), `"additionalProperties":false`)

	outputBytes, err := json.Marshal(tool.OutputSchema)
	require.NoError(t, err)
	require.Contains(t, string(outputBytes), `"memos"`)
}

func TestBuildToolFromOperationIncludesRequestBodySchema(t *testing.T) {
	spec, err := loadOpenAPISpec("../../../proto/gen/openapi.yaml")
	require.NoError(t, err)
	registry, err := buildOperationRegistry(spec)
	require.NoError(t, err)

	tool, operation := buildToolFromOperation(registry["MemoService_CreateMemo"])
	require.Equal(t, "POST", operation.Method)
	require.False(t, tool.Annotations.ReadOnlyHint)
	require.False(t, *tool.Annotations.DestructiveHint)
	require.False(t, tool.Annotations.IdempotentHint)

	input, ok := tool.InputSchema.(jsonSchema)
	require.True(t, ok)
	require.Contains(t, input["required"], "body")
	properties, ok := input["properties"].(map[string]any)
	require.True(t, ok)
	require.Contains(t, properties, "memoId")
	require.Contains(t, properties, "body")
	body, ok := properties["body"].(jsonSchema)
	require.True(t, ok)
	require.Equal(t, "object", body["type"])
	require.Contains(t, body["properties"], "content")

	err = validateToolArguments(input, map[string]any{
		"body": map[string]any{
			"content": "hello",
		},
	})
	require.NoError(t, err)
}

func TestBuildToolFromOperationTailorsRequestBodySchemas(t *testing.T) {
	spec, err := loadOpenAPISpec("../../../proto/gen/openapi.yaml")
	require.NoError(t, err)
	registry, err := buildOperationRegistry(spec)
	require.NoError(t, err)

	tests := []struct {
		name              string
		operationID       string
		arguments         map[string]any
		omittedProperties []string
	}{
		{
			name:        "partial memo update",
			operationID: "MemoService_UpdateMemo",
			arguments: map[string]any{
				"memo": "memos/abc123",
				"body": map[string]any{"content": "updated"},
			},
			omittedProperties: []string{"name"},
		},
		{
			name:        "comment defaults state and visibility",
			operationID: "MemoService_CreateMemoComment",
			arguments: map[string]any{
				"memo": "memos/abc123",
				"body": map[string]any{"content": "comment"},
			},
		},
		{
			name:        "set attachments gets name from path",
			operationID: "MemoService_SetMemoAttachments",
			arguments: map[string]any{
				"memo": "memos/abc123",
				"body": map[string]any{"attachments": []any{}},
			},
			omittedProperties: []string{"name"},
		},
		{
			name:        "set relations gets name from path",
			operationID: "MemoService_SetMemoRelations",
			arguments: map[string]any{
				"memo": "memos/abc123",
				"body": map[string]any{"relations": []any{}},
			},
			omittedProperties: []string{"name"},
		},
		{
			name:        "upsert reaction gets name from path",
			operationID: "MemoService_UpsertMemoReaction",
			arguments: map[string]any{
				"memo": "memos/abc123",
				"body": map[string]any{
					"reaction": map[string]any{
						"contentId":    "memos/abc123",
						"reactionType": "👍",
					},
				},
			},
			omittedProperties: []string{"name"},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			tool, _ := buildToolFromOperation(registry[test.operationID])
			input, ok := tool.InputSchema.(jsonSchema)
			require.True(t, ok)
			require.NoError(t, validateToolArguments(input, test.arguments))

			properties := schemaProperties(input["properties"])
			body := schemaProperties(properties["body"])
			bodyProperties := schemaProperties(body["properties"])
			for _, property := range test.omittedProperties {
				require.NotContains(t, bodyProperties, property)
			}
		})
	}
}

func TestNewWorkflowToolsExposeUsableInputSchemas(t *testing.T) {
	spec, err := loadOpenAPISpec("../../../proto/gen/openapi.yaml")
	require.NoError(t, err)
	registry, err := buildOperationRegistry(spec)
	require.NoError(t, err)

	tests := []struct {
		operationID string
		arguments   map[string]any
	}{
		{
			operationID: "FinanceService_CreateFinanceCategory",
			arguments: map[string]any{
				"body": map[string]any{"displayName": "Food", "type": "EXPENSE"},
			},
		},
		{
			operationID: "FinanceService_AdjustFinanceWalletBalance",
			arguments: map[string]any{
				"wallet": "users/boris/wallets/cash",
				"body": map[string]any{
					"actualBalanceMinor": "12345",
					"occurTime":          "2026-08-13T10:00:00Z",
				},
			},
		},
		{
			operationID: "ReminderService_UpdateReminder",
			arguments: map[string]any{
				"reminder":   "users/boris/reminders/task",
				"updateMask": "title",
				"body":       map[string]any{"title": "Updated"},
			},
		},
		{
			operationID: "UserService_UpdateUserSetting",
			arguments: map[string]any{
				"setting":    "PERSONA",
				"updateMask": "headline,interest_tags",
				"body": map[string]any{
					"personaSetting": map[string]any{
						"headline":     "Builder",
						"interestTags": []any{"AI"},
					},
				},
			},
		},
	}

	for _, test := range tests {
		t.Run(test.operationID, func(t *testing.T) {
			tool, _ := buildToolFromOperation(registry[test.operationID])
			input, ok := tool.InputSchema.(jsonSchema)
			require.True(t, ok)
			require.NoError(t, validateToolArguments(input, test.arguments))
		})
	}
}

func TestAgentFacingSchemasRejectUnknownAndReadOnlyFields(t *testing.T) {
	spec, err := loadOpenAPISpec("../../../proto/gen/openapi.yaml")
	require.NoError(t, err)
	registry, err := buildOperationRegistry(spec)
	require.NoError(t, err)

	walletTool, _ := buildToolFromOperation(registry["FinanceService_CreateFinanceWallet"])
	walletInput := requireJSONSchema(t, walletTool.InputSchema)
	require.Contains(t, walletTool.Description, "initialBalanceMinor")
	require.NoError(t, validateToolArguments(walletInput, map[string]any{
		"body": map[string]any{
			"displayName":          "Cash",
			"initialBalanceMinor":  "10000",
			"allowNegativeBalance": false,
		},
	}))
	require.ErrorContains(t, validateToolArguments(walletInput, map[string]any{
		"body": map[string]any{"displayName": "Cash", "balanceMinor": "10000"},
	}), "unknown argument")

	transactionTool, _ := buildToolFromOperation(registry["FinanceService_CreateFinanceTransaction"])
	transactionInput := requireJSONSchema(t, transactionTool.InputSchema)
	require.Contains(t, transactionTool.Description, "body.occurTime is required")
	require.ErrorContains(t, validateToolArguments(transactionInput, map[string]any{
		"body": map[string]any{
			"type":        "INCOME",
			"amountMinor": "100",
			"wallet":      "users/boris/financeWallets/cash",
		},
	}), `missing required argument "body.occurTime"`)

	reminderTool, _ := buildToolFromOperation(registry["ReminderService_CreateReminder"])
	reminderInput := requireJSONSchema(t, reminderTool.InputSchema)
	require.Contains(t, reminderTool.Description, "remindTime")
	require.NoError(t, validateToolArguments(reminderInput, map[string]any{
		"body": map[string]any{
			"title":        "Review",
			"reminderList": "users/boris/reminderLists/default",
			"remindTime":   "2026-08-14T10:00:00Z",
		},
	}))
	require.ErrorContains(t, validateToolArguments(reminderInput, map[string]any{
		"body": map[string]any{
			"title":        "Review",
			"reminderList": "users/boris/reminderLists/default",
			"dueTime":      "2026-08-14T10:00:00Z",
			"details":      "silently ignored before this guard",
		},
	}), "unknown argument")
}

func TestUserSettingToolsExposeSafeDiscoverableKeys(t *testing.T) {
	spec, err := loadOpenAPISpec("../../../proto/gen/openapi.yaml")
	require.NoError(t, err)
	registry, err := buildOperationRegistry(spec)
	require.NoError(t, err)

	getTool, _ := buildToolFromOperation(registry["UserService_GetUserSetting"])
	getInput := requireJSONSchema(t, getTool.InputSchema)
	getProperties := schemaProperties(getInput["properties"])
	settingSchema, ok := asSchemaMap(getProperties["setting"])
	require.True(t, ok)
	require.Equal(t, []string{"GENERAL", "TAGS", "PERSONA"}, settingSchema["enum"])
	require.Contains(t, settingSchema["description"], "Uppercase")
	require.NoError(t, validateToolArguments(getInput, map[string]any{"setting": "PERSONA"}))
	require.Error(t, validateToolArguments(getInput, map[string]any{"setting": "persona"}))
	require.Error(t, validateToolArguments(getInput, map[string]any{"setting": "WEBHOOKS"}))

	updateTool, _ := buildToolFromOperation(registry["UserService_UpdateUserSetting"])
	updateInput := requireJSONSchema(t, updateTool.InputSchema)
	updateProperties := schemaProperties(updateInput["properties"])
	updateMask, ok := asSchemaMap(updateProperties["updateMask"])
	require.True(t, ok)
	require.Contains(t, updateMask["description"], "interest_tags")
	body := schemaProperties(updateProperties["body"])
	require.NotContains(t, schemaProperties(body["properties"]), "webhooksSetting")
	require.NoError(t, validateToolArguments(updateInput, map[string]any{
		"setting":    "PERSONA",
		"updateMask": "headline,interest_tags",
		"body": map[string]any{
			"personaSetting": map[string]any{"headline": "Builder", "interestTags": []any{"AI"}},
		},
	}))
	require.ErrorContains(t, validateToolArguments(updateInput, map[string]any{
		"setting":    "PERSONA",
		"updateMask": "headline",
		"body": map[string]any{
			"personaSetting": map[string]any{"headline": "Builder", "unknownField": true},
		},
	}), "unknown argument")
}

func TestSetMemoAttachmentsDescribesDestructiveReplacement(t *testing.T) {
	spec, err := loadOpenAPISpec("../../../proto/gen/openapi.yaml")
	require.NoError(t, err)
	registry, err := buildOperationRegistry(spec)
	require.NoError(t, err)

	tool, _ := buildToolFromOperation(registry["MemoService_SetMemoAttachments"])
	require.Contains(t, tool.Description, "permanently deleted")
}

func TestNewWorkflowToolsRejectIncompleteMutations(t *testing.T) {
	spec, err := loadOpenAPISpec("../../../proto/gen/openapi.yaml")
	require.NoError(t, err)
	registry, err := buildOperationRegistry(spec)
	require.NoError(t, err)

	for _, test := range []struct {
		operationID string
		arguments   map[string]any
	}{
		{
			operationID: "FinanceService_GetFinanceSummary",
			arguments:   map[string]any{},
		},
		{
			operationID: "ReminderService_UpdateReminder",
			arguments: map[string]any{
				"reminder": "users/boris/reminders/task",
				"body":     map[string]any{"title": "Updated"},
			},
		},
		{
			operationID: "UserService_UpdateUserSetting",
			arguments: map[string]any{
				"setting": "users/boris/settings/PERSONA",
				"body":    map[string]any{},
			},
		},
	} {
		t.Run(test.operationID, func(t *testing.T) {
			tool, _ := buildToolFromOperation(registry[test.operationID])
			input, ok := tool.InputSchema.(jsonSchema)
			require.True(t, ok)
			require.Error(t, validateToolArguments(input, test.arguments))
		})
	}
}

func TestBuildToolFromOperationRejectsEmptyMemoUpdateBody(t *testing.T) {
	spec, err := loadOpenAPISpec("../../../proto/gen/openapi.yaml")
	require.NoError(t, err)
	registry, err := buildOperationRegistry(spec)
	require.NoError(t, err)

	tool, _ := buildToolFromOperation(registry["MemoService_UpdateMemo"])
	input, ok := tool.InputSchema.(jsonSchema)
	require.True(t, ok)

	// An empty body carries no fields to update; reject it at the schema instead of
	// letting the gateway infer an empty field mask and fail late.
	require.Error(t, validateToolArguments(input, map[string]any{
		"memo": "memos/abc123",
		"body": map[string]any{},
	}))
	require.NoError(t, validateToolArguments(input, map[string]any{
		"memo": "memos/abc123",
		"body": map[string]any{"content": "updated"},
	}))
}

func TestRequestBodySchemaOverridePreservesRequiredByDefault(t *testing.T) {
	const operationID = "TestService_UpdateResource"
	requestBodySchemaOverrides[operationID] = requestBodySchemaOverride{
		omittedProperties: []string{"name"},
	}
	t.Cleanup(func() {
		delete(requestBodySchemaOverrides, operationID)
	})

	schema := requestBodySchema(&openAPIOperation{
		OperationID: operationID,
		RequestBodySchema: jsonSchema{
			"type":     "object",
			"required": []string{"content"},
			"properties": map[string]any{
				"name":    jsonSchema{"type": "string"},
				"content": jsonSchema{"type": "string"},
			},
		},
	})

	require.Equal(t, []string{"content"}, schema["required"])
	require.NotContains(t, schemaProperties(schema["properties"]), "name")
}

func TestBuildToolFromOperationExposesCreateAttachment(t *testing.T) {
	spec, err := loadOpenAPISpec("../../../proto/gen/openapi.yaml")
	require.NoError(t, err)
	registry, err := buildOperationRegistry(spec)
	require.NoError(t, err)

	tool, operation := buildToolFromOperation(registry["AttachmentService_CreateAttachment"])
	require.Equal(t, "attachment_create_attachment", tool.Name)
	require.Equal(t, "POST", operation.Method)
	require.False(t, tool.Annotations.ReadOnlyHint)
	require.False(t, *tool.Annotations.DestructiveHint)
	require.False(t, tool.Annotations.IdempotentHint)

	input, ok := tool.InputSchema.(jsonSchema)
	require.True(t, ok)
	require.Contains(t, input["required"], "body")
	properties, ok := input["properties"].(map[string]any)
	require.True(t, ok)
	// attachmentId is an optional query parameter; the file itself is the body.
	require.Contains(t, properties, "attachmentId")
	require.Contains(t, properties, "body")
	body, ok := properties["body"].(jsonSchema)
	require.True(t, ok)
	require.Contains(t, body["properties"], "filename")
	require.Contains(t, body["properties"], "content")

	err = validateToolArguments(input, map[string]any{
		"body": map[string]any{
			"filename": "screenshot.png",
			"type":     "image/png",
			"content":  "aGVsbG8=",
		},
	})
	require.NoError(t, err)
}

func TestBuildToolFromOperationExposesCurrentUser(t *testing.T) {
	spec, err := loadOpenAPISpec("../../../proto/gen/openapi.yaml")
	require.NoError(t, err)
	registry, err := buildOperationRegistry(spec)
	require.NoError(t, err)

	tool, operation := buildToolFromOperation(registry["AuthService_GetCurrentUser"])
	require.Equal(t, "auth_get_current_user", tool.Name)
	require.Equal(t, "GET", operation.Method)
	require.True(t, tool.Annotations.ReadOnlyHint)
}

func TestBuildToolFromOperationInfersCurrentUserForListShortcuts(t *testing.T) {
	spec, err := loadOpenAPISpec("../../../proto/gen/openapi.yaml")
	require.NoError(t, err)
	registry, err := buildOperationRegistry(spec)
	require.NoError(t, err)

	tool, operation := buildToolFromOperation(registry["ShortcutService_ListShortcuts"])
	require.Equal(t, "shortcut_list_shortcuts", tool.Name)
	require.Equal(t, "GET", operation.Method)
	require.True(t, tool.Annotations.ReadOnlyHint)

	input, ok := tool.InputSchema.(jsonSchema)
	require.True(t, ok)
	properties, ok := input["properties"].(map[string]any)
	require.True(t, ok)
	require.NotContains(t, properties, "user")
	require.True(t, operation.ImplicitCurrentUser)
	require.ErrorContains(t, validateToolArguments(input, map[string]any{"user": "users/boris"}), `unknown argument "user"`)
}

func TestBuildToolFromOperationMarksSetOperationsIdempotent(t *testing.T) {
	spec, err := loadOpenAPISpec("../../../proto/gen/openapi.yaml")
	require.NoError(t, err)
	registry, err := buildOperationRegistry(spec)
	require.NoError(t, err)

	for _, operationID := range []string{"MemoService_SetMemoAttachments", "MemoService_SetMemoRelations"} {
		tool, operation := buildToolFromOperation(registry[operationID])
		require.Equal(t, "PATCH", operation.Method, operationID)
		// PATCH is non-idempotent by the method heuristic, but the per-operation
		// override restores the declarative "set" semantics.
		require.True(t, tool.Annotations.IdempotentHint, operationID)
		require.False(t, tool.Annotations.ReadOnlyHint, operationID)
		require.True(t, *tool.Annotations.DestructiveHint, operationID)
	}
}

func TestBuildToolFromOperationMarksUpdateMemoDestructive(t *testing.T) {
	spec, err := loadOpenAPISpec("../../../proto/gen/openapi.yaml")
	require.NoError(t, err)
	registry, err := buildOperationRegistry(spec)
	require.NoError(t, err)

	tool, operation := buildToolFromOperation(registry["MemoService_UpdateMemo"])
	require.Equal(t, "PATCH", operation.Method)
	require.False(t, tool.Annotations.ReadOnlyHint)
	require.True(t, *tool.Annotations.DestructiveHint)
	require.False(t, tool.Annotations.IdempotentHint)
}

func TestBuildCuratedToolsHasUniqueNames(t *testing.T) {
	spec, err := loadOpenAPISpec("../../../proto/gen/openapi.yaml")
	require.NoError(t, err)
	registry, err := buildOperationRegistry(spec)
	require.NoError(t, err)

	tools, operations, err := buildCuratedTools(registry)
	require.NoError(t, err)
	require.Len(t, tools, len(curatedOperationIDs))
	require.Len(t, operations, len(curatedOperationIDs))

	names := map[string]struct{}{}
	for _, tool := range tools {
		require.IsType(t, &sdkmcp.Tool{}, tool)
		require.NotEmpty(t, tool.Name)
		require.NotContains(t, names, tool.Name)
		names[tool.Name] = struct{}{}
		require.Equal(t, tool.Name, operations[tool.Name].ToolName)

		inputBytes, err := json.Marshal(tool.InputSchema)
		require.NoError(t, err)
		require.NotContains(t, string(inputBytes), "#/components/schemas")
		outputBytes, err := json.Marshal(tool.OutputSchema)
		require.NoError(t, err)
		require.NotContains(t, string(outputBytes), "#/components/schemas")
	}
}

func TestCuratedToolsHaveDiscoveryDescriptions(t *testing.T) {
	spec, err := loadOpenAPISpec("../../../proto/gen/openapi.yaml")
	require.NoError(t, err)
	registry, err := buildOperationRegistry(spec)
	require.NoError(t, err)

	tools, _, err := buildCuratedTools(registry)
	require.NoError(t, err)
	for _, tool := range tools {
		require.NotEmpty(t, strings.TrimSpace(tool.Description), "%s must tell agents when to use it", tool.Name)
	}
}

func TestMemoMoodDisplayToolsAreDiscoverableAndConstrained(t *testing.T) {
	spec, err := loadOpenAPISpec("../../../proto/gen/openapi.yaml")
	require.NoError(t, err)
	registry, err := buildOperationRegistry(spec)
	require.NoError(t, err)

	getTool, _ := buildToolFromOperation(registry["InstanceService_GetMemoMoodDisplay"])
	require.Equal(t, "instance_get_memo_mood_display", getTool.Name)
	require.Contains(t, getTool.Description, "emoji")
	require.Contains(t, getTool.Description, "color")
	require.Contains(t, getTool.Description, "moodLevel")
	require.True(t, getTool.Annotations.ReadOnlyHint)

	updateTool, _ := buildToolFromOperation(registry["InstanceService_UpdateMemoMoodDisplay"])
	require.Equal(t, "instance_update_memo_mood_display", updateTool.Name)
	require.Contains(t, updateTool.Description, "memo_set_memo_mood")
	require.Contains(t, updateTool.Description, "Never use this")
	require.Contains(t, updateTool.Description, "Administrator-only")
	require.False(t, updateTool.Annotations.ReadOnlyHint)
	require.True(t, updateTool.Annotations.IdempotentHint)
	require.True(t, *updateTool.Annotations.DestructiveHint)

	input := requireJSONSchema(t, updateTool.InputSchema)
	body := requireJSONSchema(t, schemaProperties(input["properties"])["body"])
	require.Equal(t, []string{"updates"}, requiredNames(body["required"]))
	updates := requireJSONSchema(t, schemaProperties(body["properties"])["updates"])
	require.EqualValues(t, 1, updates["minItems"])
	require.EqualValues(t, 7, updates["maxItems"])

	defs := schemaProperties(input["$defs"])
	levelUpdate := requireJSONSchema(t, defs["UpdateMemoMoodDisplayRequest_MoodLevelUpdate"])
	levelProperties := schemaProperties(levelUpdate["properties"])
	level := requireJSONSchema(t, levelProperties["level"])
	require.EqualValues(t, 1, level["minimum"])
	require.EqualValues(t, 7, level["maximum"])
	require.Equal(t, `^#[0-9A-Fa-f]{6}$|^$`, requireJSONSchema(t, levelProperties["color"])["pattern"])
	require.EqualValues(t, 16, requireJSONSchema(t, levelProperties["emoji"])["maxLength"])

	memoUpdateTool, _ := buildToolFromOperation(registry["MemoService_UpdateMemo"])
	require.Contains(t, memoUpdateTool.Description, "one existing memo")
	require.Contains(t, memoUpdateTool.Description, "memo_set_memo_mood")
	require.Contains(t, memoUpdateTool.Description, "instance_update_memo_mood_display")

	setTool, _ := buildToolFromOperation(registry["MemoService_SetMemoMood"])
	require.Equal(t, "memo_set_memo_mood", setTool.Name)
	require.Contains(t, setTool.Description, "one existing memo")
	require.Contains(t, setTool.Description, "body.moodLevel")
	require.Contains(t, setTool.Description, "0 to clear")
	require.True(t, setTool.Annotations.IdempotentHint)
	require.True(t, *setTool.Annotations.DestructiveHint)
	setInput := requireJSONSchema(t, setTool.InputSchema)
	setProperties := schemaProperties(setInput["properties"])
	setBody := requireJSONSchema(t, setProperties["body"])
	require.Equal(t, []string{"moodLevel"}, requiredNames(setBody["required"]))
	require.NotContains(t, schemaProperties(setBody["properties"]), "name")
	moodLevel := requireJSONSchema(t, schemaProperties(setBody["properties"])["moodLevel"])
	require.EqualValues(t, 0, moodLevel["minimum"])
	require.EqualValues(t, 7, moodLevel["maximum"])
	require.NoError(t, validateToolArguments(setInput, map[string]any{
		"memo": "memos/abc123",
		"body": map[string]any{"moodLevel": 4},
	}))
	require.Error(t, validateToolArguments(setInput, map[string]any{
		"memo": "memos/abc123",
		"body": map[string]any{"moodLevel": 8},
	}))
}

func TestBuildCuratedToolsRejectsMissingOperation(t *testing.T) {
	_, _, err := buildCuratedTools(map[string]*openAPIOperation{})
	require.ErrorContains(t, err, "curated OpenAPI operation")
	require.ErrorContains(t, err, "not found")
}

func TestValidateOperationOverridesRejectsStaleKey(t *testing.T) {
	spec, err := loadOpenAPISpec("../../../proto/gen/openapi.yaml")
	require.NoError(t, err)
	registry, err := buildOperationRegistry(spec)
	require.NoError(t, err)
	require.NoError(t, validateOperationOverrides(registry))

	// A renamed/removed operation must be reported instead of silently losing its
	// override.
	delete(registry, "MemoService_UpdateMemo")
	require.ErrorContains(t, validateOperationOverrides(registry), "MemoService_UpdateMemo")
}

func TestBuildCuratedToolsRejectsDuplicateToolNames(t *testing.T) {
	registry := make(map[string]*openAPIOperation, len(curatedOperationIDs))
	for _, operationID := range curatedOperationIDs {
		registry[operationID] = &openAPIOperation{
			OperationID:    operationID,
			Description:    operationID,
			Method:         "GET",
			Path:           "/api/v1/test",
			ResponseSchema: okSchema(),
		}
	}
	registry["MemoService_ListMemos"].OperationID = "MemoService_GetMemo"

	_, _, err := buildCuratedTools(registry)
	require.ErrorContains(t, err, "duplicate MCP tool name")
}
