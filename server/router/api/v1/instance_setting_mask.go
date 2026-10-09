package v1

import (
	"strings"

	"github.com/pkg/errors"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/reflect/protoreflect"
	"google.golang.org/protobuf/types/known/fieldmaskpb"

	v1pb "github.com/usememos/memos/proto/gen/api/v1"
)

// mergeInstanceSettingMask applies paths relative to the selected setting, or
// paths prefixed with its oneof field name. An omitted mask retains the legacy
// full replacement behavior.
func mergeInstanceSettingMask(incoming, existing *v1pb.InstanceSetting, mask *fieldmaskpb.FieldMask) (*v1pb.InstanceSetting, error) {
	if mask == nil || len(mask.Paths) == 0 {
		return incoming, nil
	}
	source := incoming.ProtoReflect()
	variant := source.WhichOneof(source.Descriptor().Oneofs().ByName("value"))
	if variant == nil {
		return nil, errors.New("setting value is required")
	}
	result := &v1pb.InstanceSetting{Name: incoming.Name}
	if existing != nil {
		result = proto.Clone(existing).(*v1pb.InstanceSetting)
	}
	result.Name = incoming.Name
	target := result.ProtoReflect()
	if target.WhichOneof(target.Descriptor().Oneofs().ByName("value")) != variant {
		target.Set(variant, target.NewField(variant))
	}
	for _, path := range mask.Paths {
		parts := strings.Split(path, ".")
		if len(parts) == 0 || parts[0] == "" {
			return nil, errors.Errorf("invalid update mask path %q", path)
		}
		if parts[0] == string(variant.Name()) {
			parts = parts[1:]
			if len(parts) == 0 {
				target.Set(variant, protoreflect.ValueOfMessage(proto.Clone(source.Get(variant).Message().Interface()).ProtoReflect()))
				continue
			}
		}
		if err := copyMaskedSettingField(target.Mutable(variant).Message(), source.Get(variant).Message(), parts); err != nil {
			return nil, errors.Wrapf(err, "invalid update mask path %q", path)
		}
	}
	return result, nil
}

func copyMaskedSettingField(target, source protoreflect.Message, parts []string) error {
	field := target.Descriptor().Fields().ByName(protoreflect.Name(parts[0]))
	if field == nil || parts[0] == "name" {
		return errors.New("unknown field")
	}
	if len(parts) > 1 {
		if field.Kind() != protoreflect.MessageKind || field.IsList() || field.IsMap() {
			return errors.New("field has no nested fields")
		}
		if !source.Has(field) {
			return errors.New("nested field requires its parent message")
		}
		return copyMaskedSettingField(target.Mutable(field).Message(), source.Get(field).Message(), parts[1:])
	}
	target.Clear(field)
	if !source.Has(field) {
		return nil
	}
	value := source.Get(field)
	switch {
	case field.IsList():
		list := target.Mutable(field).List()
		for i := 0; i < value.List().Len(); i++ {
			item := value.List().Get(i)
			if field.Kind() == protoreflect.MessageKind {
				item = protoreflect.ValueOfMessage(proto.Clone(item.Message().Interface()).ProtoReflect())
			}
			list.Append(item)
		}
	case field.IsMap():
		output := target.Mutable(field).Map()
		value.Map().Range(func(key protoreflect.MapKey, item protoreflect.Value) bool {
			if field.MapValue().Kind() == protoreflect.MessageKind {
				item = protoreflect.ValueOfMessage(proto.Clone(item.Message().Interface()).ProtoReflect())
			}
			output.Set(key, item)
			return true
		})
	case field.Kind() == protoreflect.MessageKind:
		target.Set(field, protoreflect.ValueOfMessage(proto.Clone(value.Message().Interface()).ProtoReflect()))
	default:
		target.Set(field, value)
	}
	return nil
}
