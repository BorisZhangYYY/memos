package mcp

import (
	"maps"
	"regexp"
	"slices"
	"strings"

	sdkmcp "github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/pkg/errors"
)

var curatedOperationIDs = []string{
	"MemoService_ListMemos",
	"MemoService_CreateMemo",
	"MemoService_GetMemo",
	"MemoService_UpdateMemo",
	"MemoService_SetMemoMood",
	"MemoService_DeleteMemo",
	"MemoService_ListMemoComments",
	"MemoService_CreateMemoComment",
	"MemoService_ListMemoAttachments",
	"MemoService_SetMemoAttachments",
	"MemoService_ListMemoReactions",
	"MemoService_UpsertMemoReaction",
	"MemoService_DeleteMemoReaction",
	"MemoService_ListMemoRelations",
	"MemoService_SetMemoRelations",
	"AttachmentService_ListAttachments",
	"AttachmentService_CreateAttachment",
	"AttachmentService_GetAttachment",
	"AttachmentService_DeleteAttachment",
	"ShortcutService_ListShortcuts",
	"ReminderService_ListReminderLists",
	"ReminderService_CreateReminderList",
	"ReminderService_UpdateReminderList",
	"ReminderService_DeleteReminderList",
	"ReminderService_ListReminders",
	"ReminderService_CreateReminder",
	"ReminderService_UpdateReminder",
	"ReminderService_DeleteReminder",
	"ReminderService_CompleteReminder",
	"ReminderService_ClearCompletedReminders",
	// Private finance ledger: wallets, categories, transactions, reconciliation,
	// transfers (created as transaction type TRANSFER), and aggregate summaries.
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
	// Structured statistics, narrowly scoped memo mood presentation, and private
	// user-setting access. The mood update is admin-only at the API layer.
	"InstanceService_GetInstanceStats",
	"InstanceService_GetMemoMoodDisplay",
	"InstanceService_UpdateMemoMoodDisplay",
	"UserService_GetUserStats",
	"UserService_GetUserSetting",
	"UserService_UpdateUserSetting",
	// The only allowed auth/identity operation: a read-only "whoami" so agents
	// can resolve the current user (e.g. for ShortcutService_ListShortcuts).
	"AuthService_GetCurrentUser",
}

type registeredOperation struct {
	ToolName    string
	OperationID string
	Method      string
	Path        string
	Operation   *openAPIOperation
	InputSchema jsonSchema
	// ImplicitCurrentUser marks operations whose REST path is scoped by
	// /users/{user}. MCP tools intentionally hide that transport-level path
	// parameter and resolve it from the caller's Authorization header instead.
	ImplicitCurrentUser bool
}

type requestBodySchemaOverride struct {
	// required replaces the base schema's required list when non-empty.
	required []string
	// clearRequired explicitly removes the base schema's required list.
	clearRequired     bool
	omittedProperties []string
	// minProperties, when > 0, requires the body to carry at least that many
	// properties. It replaces a cleared required list for partial updates so an
	// empty body is rejected up front instead of failing later at the API.
	minProperties int
	// requiredArguments adds top-level path/query/body argument names that the
	// generated OpenAPI marks optional even though the service requires them.
	requiredArguments []string
}

type argumentSchemaOverride struct {
	description string
	enum        []string
}

// requestBodySchemaOverrides adjusts resource schemas to match how each HTTP
// binding consumes its request body. Resource-level required fields are too
// strict for partial updates, while body: "*" schemas include fields already
// supplied by the path.
var requestBodySchemaOverrides = map[string]requestBodySchemaOverride{
	"MemoService_CreateMemo": {
		required: []string{"content"},
	},
	"MemoService_UpdateMemo": {
		clearRequired:     true,
		omittedProperties: []string{"name"},
		minProperties:     1,
	},
	"MemoService_SetMemoMood": {
		required:          []string{"moodLevel"},
		omittedProperties: []string{"name"},
	},
	"MemoService_CreateMemoComment": {
		required: []string{"content"},
	},
	"MemoService_SetMemoAttachments": {
		required:          []string{"attachments"},
		omittedProperties: []string{"name"},
	},
	"MemoService_SetMemoRelations": {
		required:          []string{"relations"},
		omittedProperties: []string{"name"},
	},
	"MemoService_UpsertMemoReaction": {
		required:          []string{"reaction"},
		omittedProperties: []string{"name"},
	},
	"ReminderService_UpdateReminderList": {
		clearRequired:     true,
		omittedProperties: []string{"name"},
		minProperties:     1,
		requiredArguments: []string{"updateMask"},
	},
	"ReminderService_CreateReminder": {
		omittedProperties: []string{"name", "state"},
	},
	"ReminderService_UpdateReminder": {
		clearRequired:     true,
		omittedProperties: []string{"name"},
		minProperties:     1,
		requiredArguments: []string{"updateMask"},
	},
	"ReminderService_CompleteReminder": {
		clearRequired:     true,
		omittedProperties: []string{"name"},
	},
	"ReminderService_ClearCompletedReminders": {
		clearRequired:     true,
		omittedProperties: []string{"parent"},
	},
	"FinanceService_CreateFinanceCategory": {
		required:          []string{"displayName", "type"},
		omittedProperties: []string{"name", "state"},
	},
	"FinanceService_CreateFinanceWallet": {
		required:          []string{"displayName"},
		omittedProperties: []string{"name", "state"},
	},
	"FinanceService_CreateFinanceTransaction": {
		omittedProperties: []string{"name"},
	},
	"FinanceService_UpdateFinanceWallet": {
		clearRequired:     true,
		omittedProperties: []string{"name", "initialBalanceMinor"},
		minProperties:     1,
		requiredArguments: []string{"updateMask"},
	},
	"FinanceService_UpdateFinanceCategory": {
		clearRequired:     true,
		omittedProperties: []string{"name", "type"},
		minProperties:     1,
		requiredArguments: []string{"updateMask"},
	},
	"FinanceService_UpdateFinanceTransaction": {
		clearRequired:     true,
		omittedProperties: []string{"name"},
		minProperties:     1,
		requiredArguments: []string{"updateMask"},
	},
	"FinanceService_AdjustFinanceWalletBalance": {
		required:          []string{"actualBalanceMinor", "occurTime"},
		omittedProperties: []string{"wallet"},
	},
	"FinanceService_GetFinanceSummary": {
		requiredArguments: []string{"startTime", "endTime", "timeZone"},
	},
	"InstanceService_UpdateMemoMoodDisplay": {
		required: []string{"updates"},
	},
	"UserService_UpdateUserSetting": {
		clearRequired:     true,
		omittedProperties: []string{"name", "webhooksSetting"},
		minProperties:     1,
		requiredArguments: []string{"updateMask"},
	},
}

var argumentSchemaOverrides = map[string]map[string]argumentSchemaOverride{
	"FinanceService_UpdateFinanceWallet": {
		"updateMask": {
			description: "Comma-separated proto field names in snake_case. Allowed fields are display_name, allow_negative_balance, and state.",
		},
	},
	"FinanceService_UpdateFinanceCategory": {
		"updateMask": {
			description: "Comma-separated proto field names in snake_case. Allowed fields are display_name, emoji, and state; use emoji to change the category icon. The category type is immutable.",
		},
	},
	"FinanceService_UpdateFinanceTransaction": {
		"updateMask": {
			description: "Comma-separated proto field names in snake_case identifying the transaction fields to correct. Updating a transaction rebuilds affected wallet balance snapshots.",
		},
	},
	"ReminderService_UpdateReminderList": {
		"updateMask": {
			description: "Comma-separated proto field names in snake_case. Allowed fields include display_name, color, icon, sort_order, and state.",
		},
	},
	"ReminderService_UpdateReminder": {
		"updateMask": {
			description: "Comma-separated proto field names in snake_case identifying reminder fields to update, such as title, due_date, remind_time, priority, tags, location, or state.",
		},
	},
	"UserService_GetUserSetting": {
		"setting": {
			description: "Uppercase setting key. Allowed values are GENERAL, TAGS, and PERSONA; webhook settings are intentionally unavailable to agents.",
			enum:        []string{"GENERAL", "TAGS", "PERSONA"},
		},
	},
	"UserService_UpdateUserSetting": {
		"setting": {
			description: "Uppercase setting key. Allowed values are GENERAL, TAGS, and PERSONA; webhook settings are intentionally unavailable to agents.",
			enum:        []string{"GENERAL", "TAGS", "PERSONA"},
		},
		"updateMask": {
			description: "Comma-separated proto field names in snake_case. PERSONA supports headline, preferred_address, communication_style, interest_tags, routine_preferences, life_stage, and goals; GENERAL supports memo_visibility, theme, and locale; TAGS supports tags.",
		},
	},
}

var operationDescriptionOverrides = map[string]string{
	"MemoService_CreateMemo":                  "Create a memo. Set body.content, optional body.visibility, and optional body.moodLevel from 1 through 7; moodLevel records this memo's mood and does not configure the level's display emoji or color.",
	"MemoService_UpdateMemo":                  "Update general fields on one existing memo, such as body.content, body.visibility, or body.pinned. For a mood-only change, prefer memo_set_memo_mood; use instance_update_memo_mood_display only for the instance-wide display emoji or color.",
	"MemoService_SetMemoMood":                 "Set the mood recorded on one existing memo. Use body.moodLevel from 1 through 7, or 0 to clear the memo's mood. This changes only that memo; it does not change the instance-wide display emoji or color.",
	"MemoService_SetMemoAttachments":          "Replace the memo's complete attachment set. Existing attachments omitted from body.attachments are permanently deleted, not merely unlinked.",
	"ReminderService_CreateReminder":          "Create a reminder. Use body.remindTime for an exact notification timestamp or body.dueDate for a date-only reminder; there is no details field.",
	"FinanceService_CreateFinanceWallet":      "Create a private wallet. Set its opening balance with body.initialBalanceMinor; the current balance is output-only.",
	"FinanceService_CreateFinanceTransaction": "Record an income, expense, or transfer. body.occurTime is required and must be an RFC 3339 timestamp.",
	"FinanceService_UpdateFinanceCategory":    "Update an income or expense category's display name, emoji, or archive state. Use body.emoji with updateMask=\"emoji\" to change the icon shown for the category; its type is immutable.",
	"FinanceService_UpdateFinanceTransaction": "Correct a ledger transaction and rebuild affected running-balance snapshots in chronological order.",
	"InstanceService_GetMemoMoodDisplay":      "Read the effective instance-wide emoji and #RRGGBB color for all seven memo mood levels. This is display configuration; it does not read or change the moodLevel recorded on any individual memo.",
	"InstanceService_UpdateMemoMoodDisplay":   "Administrator-only display configuration. Partially update instance-wide emoji and/or color for selected memo mood levels with body.updates; omitted levels and fields stay unchanged, and an empty emoji or color restores that level's default. Never use this to set the mood recorded on one memo; use memo_set_memo_mood for that.",
	"UserService_GetUserSetting":              "Read the current user's GENERAL, TAGS, or PERSONA setting. The setting key must be uppercase.",
	"UserService_UpdateUserSetting":           "Update the current user's GENERAL, TAGS, or PERSONA setting. The setting key must be uppercase and updateMask uses proto snake_case field names.",
}

type requestBodySchemaRefinement func(jsonSchema)

var requestBodySchemaRefinements = map[string]requestBodySchemaRefinement{
	"MemoService_SetMemoMood":               refineSetMemoMoodInputSchema,
	"InstanceService_UpdateMemoMoodDisplay": refineMemoMoodDisplayInputSchema,
}

var wordBoundary = regexp.MustCompile(`([a-z0-9])([A-Z])`)

// validateOperationOverrides fails fast when a per-operation override table
// references an operation that is not in the registry (e.g. after a proto RPC
// rename). Without this, a stale key would silently miss and the renamed
// operation would lose its schema/annotation override with no error.
func validateOperationOverrides(registry map[string]*openAPIOperation) error {
	tables := []struct {
		name string
		ids  []string
	}{
		{"requestBodySchemaOverrides", mapKeys(requestBodySchemaOverrides)},
		{"argumentSchemaOverrides", mapKeys(argumentSchemaOverrides)},
		{"operationDescriptionOverrides", mapKeys(operationDescriptionOverrides)},
		{"requestBodySchemaRefinements", mapKeys(requestBodySchemaRefinements)},
		{"idempotentOperationIDs", mapKeys(idempotentOperationIDs)},
		{"destructiveOperationIDs", mapKeys(destructiveOperationIDs)},
	}
	for _, table := range tables {
		for _, operationID := range table.ids {
			if _, ok := registry[operationID]; !ok {
				return errors.Errorf("%s references unknown operation %q", table.name, operationID)
			}
		}
	}
	return nil
}

func mapKeys[V any](m map[string]V) []string {
	keys := make([]string, 0, len(m))
	for key := range m {
		keys = append(keys, key)
	}
	return keys
}

func buildCuratedTools(registry map[string]*openAPIOperation) ([]*sdkmcp.Tool, map[string]*registeredOperation, error) {
	tools := make([]*sdkmcp.Tool, 0, len(curatedOperationIDs))
	operations := map[string]*registeredOperation{}
	for _, operationID := range curatedOperationIDs {
		operation, ok := registry[operationID]
		if !ok {
			return nil, nil, errors.Errorf("curated OpenAPI operation %q not found", operationID)
		}

		tool, registered := buildToolFromOperation(operation)
		if _, exists := operations[tool.Name]; exists {
			return nil, nil, errors.Errorf("duplicate MCP tool name %q", tool.Name)
		}

		tools = append(tools, tool)
		operations[tool.Name] = registered
	}

	if err := validateOperationOverrides(registry); err != nil {
		return nil, nil, err
	}
	return tools, operations, nil
}

func buildToolFromOperation(operation *openAPIOperation) (*sdkmcp.Tool, *registeredOperation) {
	name := toolNameFromOperationID(operation.OperationID)
	title := titleFromToolName(name)
	inputSchema := inputSchemaForOperation(operation)
	description := operation.Description
	if override := operationDescriptionOverrides[operation.OperationID]; override != "" {
		description = override
	}
	tool := &sdkmcp.Tool{
		Meta: sdkmcp.Meta{
			"operationId": operation.OperationID,
			"method":      operation.Method,
			"path":        operation.Path,
		},
		Name:         name,
		Title:        title,
		Description:  description,
		InputSchema:  inputSchema,
		OutputSchema: outputSchemaForOperation(operation),
		Annotations:  annotationsForOperation(operation, title),
	}

	return tool, &registeredOperation{
		ToolName:            name,
		OperationID:         operation.OperationID,
		Method:              operation.Method,
		Path:                operation.Path,
		Operation:           operation,
		InputSchema:         inputSchema,
		ImplicitCurrentUser: usesImplicitCurrentUser(operation),
	}
}

func toolNameFromOperationID(operationID string) string {
	service, method, ok := strings.Cut(operationID, "_")
	if !ok {
		return camelToSnake(operationID)
	}
	service = strings.TrimSuffix(service, "Service")
	return camelToSnake(service) + "_" + camelToSnake(method)
}

func camelToSnake(value string) string {
	return strings.ToLower(wordBoundary.ReplaceAllString(value, `${1}_${2}`))
}

func titleFromToolName(name string) string {
	parts := strings.Split(name, "_")
	for i, part := range parts {
		if part == "" {
			continue
		}
		parts[i] = strings.ToUpper(part[:1]) + part[1:]
	}
	return strings.Join(parts, " ")
}

func inputSchemaForOperation(operation *openAPIOperation) jsonSchema {
	properties := map[string]any{}
	required := []string{}
	defs := map[string]any{}
	for _, parameter := range operation.Parameters {
		if parameter.Name == "user" && parameter.In == "path" && usesImplicitCurrentUser(operation) {
			continue
		}
		schema := cloneSchema(parameter.Schema)
		if parameter.Description != "" {
			schema["description"] = parameter.Description
		}
		properties[parameter.Name] = schema
		if parameter.Required {
			required = append(required, parameter.Name)
		}
	}

	if operation.RequestBody != nil {
		bodySchema := requestBodySchema(operation)
		for name, definition := range extractSchemaDefs(bodySchema) {
			defs[name] = definition
		}
		properties["body"] = bodySchema
		if operation.RequestBody.Required {
			required = append(required, "body")
		}
	}
	if override, ok := requestBodySchemaOverrides[operation.OperationID]; ok {
		for _, name := range override.requiredArguments {
			if _, exists := properties[name]; exists && !slices.Contains(required, name) {
				required = append(required, name)
			}
		}
	}
	if overrides := argumentSchemaOverrides[operation.OperationID]; overrides != nil {
		for name, override := range overrides {
			property, ok := asSchemaMap(properties[name])
			if !ok {
				continue
			}
			property = maps.Clone(property)
			if override.description != "" {
				property["description"] = override.description
			}
			if len(override.enum) > 0 {
				property["enum"] = override.enum
			}
			properties[name] = jsonSchema(property)
		}
	}

	schema := jsonSchema{
		"type":                 "object",
		"properties":           properties,
		"additionalProperties": false,
	}
	if len(required) > 0 {
		schema["required"] = required
	}
	if len(defs) > 0 {
		schema["$defs"] = defs
	}
	return schema
}

// usesImplicitCurrentUser reports whether an operation is scoped by the
// authenticated user. The REST API keeps an explicit /users/{user} path for
// resource-oriented clients, while MCP presents a single-user tool contract
// and fills that path segment from auth context at execution time.
func usesImplicitCurrentUser(operation *openAPIOperation) bool {
	if !strings.Contains(operation.Path, "/users/{user}") {
		return false
	}
	for _, parameter := range operation.Parameters {
		if parameter.Name == "user" && parameter.In == "path" {
			return true
		}
	}
	return false
}

func requestBodySchema(operation *openAPIOperation) jsonSchema {
	if operation.RequestBodySchema == nil {
		return jsonSchema{"type": "object"}
	}
	schema := normalizeInputSchema(operation.RequestBodySchema)
	if override, ok := requestBodySchemaOverrides[operation.OperationID]; ok {
		if override.clearRequired {
			delete(schema, "required")
		} else if len(override.required) > 0 {
			schema["required"] = override.required
		}

		if len(override.omittedProperties) > 0 {
			properties := maps.Clone(schemaProperties(schema["properties"]))
			for _, name := range override.omittedProperties {
				delete(properties, name)
			}
			schema["properties"] = properties
			required := []string{}
			for _, name := range requiredNames(schema["required"]) {
				if _, ok := properties[name]; ok {
					required = append(required, name)
				}
			}
			if len(required) == 0 {
				delete(schema, "required")
			} else {
				schema["required"] = required
			}
		}

		if override.minProperties > 0 {
			schema["minProperties"] = override.minProperties
		}
	}

	if refine := requestBodySchemaRefinements[operation.OperationID]; refine != nil {
		refine(schema)
	}
	return schema
}

func refineMemoMoodDisplayInputSchema(schema jsonSchema) {
	properties := maps.Clone(schemaProperties(schema["properties"]))
	updates, ok := asSchemaMap(properties["updates"])
	if !ok {
		return
	}
	updates = maps.Clone(updates)
	updates["minItems"] = 1
	updates["maxItems"] = 7
	properties["updates"] = jsonSchema(updates)
	schema["properties"] = properties

	items, ok := asSchemaMap(updates["items"])
	if !ok {
		return
	}
	ref, ok := items["$ref"].(string)
	if !ok {
		return
	}
	definitionName := strings.TrimPrefix(ref, "#/$defs/")
	defs := maps.Clone(schemaProperties(schema["$defs"]))
	levelUpdate, ok := asSchemaMap(defs[definitionName])
	if !ok {
		return
	}
	levelUpdate = maps.Clone(levelUpdate)
	levelProperties := maps.Clone(schemaProperties(levelUpdate["properties"]))
	if level, ok := asSchemaMap(levelProperties["level"]); ok {
		level = maps.Clone(level)
		level["minimum"] = 1
		level["maximum"] = 7
		levelProperties["level"] = jsonSchema(level)
	}
	if emoji, ok := asSchemaMap(levelProperties["emoji"]); ok {
		emoji = maps.Clone(emoji)
		emoji["maxLength"] = 16
		levelProperties["emoji"] = jsonSchema(emoji)
	}
	if color, ok := asSchemaMap(levelProperties["color"]); ok {
		color = maps.Clone(color)
		color["pattern"] = `^#[0-9A-Fa-f]{6}$|^$`
		levelProperties["color"] = jsonSchema(color)
	}
	levelUpdate["properties"] = levelProperties
	defs[definitionName] = jsonSchema(levelUpdate)
	schema["$defs"] = defs
}

func refineSetMemoMoodInputSchema(schema jsonSchema) {
	properties := maps.Clone(schemaProperties(schema["properties"]))
	moodLevel, ok := asSchemaMap(properties["moodLevel"])
	if !ok {
		return
	}
	moodLevel = maps.Clone(moodLevel)
	moodLevel["minimum"] = 0
	moodLevel["maximum"] = 7
	properties["moodLevel"] = jsonSchema(moodLevel)
	schema["properties"] = properties
}

func normalizeInputSchema(schema jsonSchema) jsonSchema {
	normalized, ok := normalizeInputSchemaValue(schema).(jsonSchema)
	if !ok {
		return cloneSchema(schema)
	}
	return normalized
}

func normalizeInputSchemaValue(value any) any {
	switch typed := value.(type) {
	case jsonSchema:
		return normalizeInputSchemaMap(map[string]any(typed))
	case map[string]any:
		return normalizeInputSchemaMap(typed)
	case []any:
		items := make([]any, len(typed))
		for i, item := range typed {
			items[i] = normalizeInputSchemaValue(item)
		}
		return items
	case []string:
		return slices.Clone(typed)
	default:
		return typed
	}
}

func normalizeInputSchemaMap(schema map[string]any) jsonSchema {
	normalized := jsonSchema{}
	for key, value := range schema {
		if key == "properties" || key == "required" {
			continue
		}
		normalized[key] = normalizeInputSchemaValue(value)
	}

	properties, hasProperties := schema["properties"]
	if !hasProperties {
		if required, ok := schema["required"]; ok {
			normalized["required"] = normalizeInputSchemaValue(required)
		}
		return normalized
	}

	normalizedProperties := map[string]any{}
	for name, propertyValue := range schemaProperties(properties) {
		if property, ok := asSchemaMap(propertyValue); ok {
			readOnly, isBool := property["readOnly"].(bool)
			if isBool && readOnly {
				continue
			}
		}
		normalizedProperties[name] = normalizeInputSchemaValue(propertyValue)
	}
	normalized["properties"] = normalizedProperties
	if _, ok := normalized["additionalProperties"]; !ok {
		normalized["additionalProperties"] = false
	}

	required := []string{}
	for _, name := range requiredNames(schema["required"]) {
		if _, ok := normalizedProperties[name]; ok {
			required = append(required, name)
		}
	}
	if len(required) > 0 {
		normalized["required"] = required
	}
	return normalized
}

func outputSchemaForOperation(operation *openAPIOperation) jsonSchema {
	if operation.ResponseSchema == nil {
		return okSchema()
	}
	return cloneSchema(operation.ResponseSchema)
}

func cloneSchema(schema jsonSchema) jsonSchema {
	clone := jsonSchema{}
	for key, value := range schema {
		clone[key] = value
	}
	return clone
}

func extractSchemaDefs(schema jsonSchema) map[string]any {
	defs := schemaProperties(schema["$defs"])
	if len(defs) == 0 {
		return nil
	}
	delete(schema, "$defs")
	return defs
}

// idempotentOperationIDs lists operations whose idempotency the HTTP-method
// heuristic gets wrong. The "Set*" operations declaratively replace the full
// set on a memo, so repeating an identical call converges to the same state —
// idempotent — even though they are served over PATCH (which the heuristic
// treats as non-idempotent).
var idempotentOperationIDs = map[string]bool{
	"MemoService_SetMemoAttachments":        true,
	"MemoService_SetMemoRelations":          true,
	"MemoService_SetMemoMood":               true,
	"InstanceService_UpdateMemoMoodDisplay": true,
}

// destructiveOperationIDs lists mutating operations that can overwrite or
// remove existing user data despite not using DELETE.
var destructiveOperationIDs = map[string]bool{
	"MemoService_UpdateMemo":                    true,
	"MemoService_SetMemoMood":                   true,
	"MemoService_SetMemoAttachments":            true,
	"MemoService_SetMemoRelations":              true,
	"ReminderService_UpdateReminderList":        true,
	"ReminderService_ClearCompletedReminders":   true,
	"ReminderService_UpdateReminder":            true,
	"FinanceService_UpdateFinanceWallet":        true,
	"FinanceService_UpdateFinanceCategory":      true,
	"FinanceService_UpdateFinanceTransaction":   true,
	"FinanceService_AdjustFinanceWalletBalance": true,
	"InstanceService_UpdateMemoMoodDisplay":     true,
	"UserService_UpdateUserSetting":             true,
}

// annotationsForOperation derives the method-based annotations and then applies
// per-operation overrides that the HTTP method alone cannot express.
func annotationsForOperation(operation *openAPIOperation, title string) *sdkmcp.ToolAnnotations {
	annotations := annotationsForMethod(operation.Method, title)
	if idempotentOperationIDs[operation.OperationID] {
		annotations.IdempotentHint = true
	}
	if destructiveOperationIDs[operation.OperationID] {
		destructive := true
		annotations.DestructiveHint = &destructive
	}
	return annotations
}

func annotationsForMethod(method string, title string) *sdkmcp.ToolAnnotations {
	openWorld := false
	destructive := false
	switch strings.ToUpper(method) {
	case "GET":
		return &sdkmcp.ToolAnnotations{
			Title:           title,
			ReadOnlyHint:    true,
			DestructiveHint: &destructive,
			IdempotentHint:  true,
			OpenWorldHint:   &openWorld,
		}
	case "DELETE":
		destructive = true
		return &sdkmcp.ToolAnnotations{
			Title:           title,
			ReadOnlyHint:    false,
			DestructiveHint: &destructive,
			IdempotentHint:  true,
			OpenWorldHint:   &openWorld,
		}
	default:
		return &sdkmcp.ToolAnnotations{
			Title:           title,
			ReadOnlyHint:    false,
			DestructiveHint: &destructive,
			IdempotentHint:  false,
			OpenWorldHint:   &openWorld,
		}
	}
}
