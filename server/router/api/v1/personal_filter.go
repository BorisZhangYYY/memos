package v1

import (
	"context"

	"github.com/pkg/errors"

	"github.com/usememos/memos/internal/filter"
)

// filterUsesField reports whether a validated memo filter references a field.
// It walks the parsed filter tree so field-like text inside a string literal is
// not mistaken for a private field access.
func filterUsesField(ctx context.Context, filterStr, fieldName string) (bool, error) {
	engine, err := filter.DefaultEngine()
	if err != nil {
		return false, err
	}
	program, err := engine.Compile(ctx, filterStr)
	if err != nil {
		return false, errors.Wrap(err, "failed to compile filter")
	}
	return conditionUsesField(program.ConditionTree(), fieldName), nil
}

func conditionUsesField(condition filter.Condition, fieldName string) bool {
	switch condition := condition.(type) {
	case *filter.LogicalCondition:
		return conditionUsesField(condition.Left, fieldName) || conditionUsesField(condition.Right, fieldName)
	case *filter.NotCondition:
		return conditionUsesField(condition.Expr, fieldName)
	case *filter.FieldPredicateCondition:
		return condition.Field == fieldName
	case *filter.ComparisonCondition:
		return valueUsesField(condition.Left, fieldName) || valueUsesField(condition.Right, fieldName)
	case *filter.InCondition:
		if valueUsesField(condition.Left, fieldName) {
			return true
		}
		for _, value := range condition.Values {
			if valueUsesField(value, fieldName) {
				return true
			}
		}
	case *filter.ElementInCondition:
		return condition.Field == fieldName || valueUsesField(condition.Element, fieldName)
	case *filter.TextMatchCondition:
		return condition.Field == fieldName
	case *filter.RegexCondition:
		return condition.Field == fieldName
	case *filter.ListComprehensionCondition:
		return condition.Field == fieldName
	default:
		return false
	}
	return false
}

func valueUsesField(value filter.ValueExpr, fieldName string) bool {
	switch value := value.(type) {
	case *filter.FieldRef:
		return value.Name == fieldName
	case *filter.FunctionValue:
		for _, argument := range value.Args {
			if valueUsesField(argument, fieldName) {
				return true
			}
		}
	case *filter.FieldAccessorValue:
		return value.Field == fieldName
	default:
		return false
	}
	return false
}
