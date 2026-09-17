package v1

import (
	"context"
	"strings"

	"google.golang.org/protobuf/types/known/emptypb"

	v1pb "github.com/usememos/memos/proto/gen/api/v1"
)

func shortcutViewName(name string) string { return strings.Replace(name, "/shortcuts/", "/views/", 1) }
func legacyShortcut(view *v1pb.MemoView) *v1pb.Shortcut {
	if view == nil {
		return nil
	}
	return &v1pb.Shortcut{Name: strings.Replace(view.Name, "/views/", "/shortcuts/", 1), Title: view.Title, Filter: view.Filter}
}
func (s *APIV1Service) ListShortcuts(ctx context.Context, r *v1pb.ListShortcutsRequest) (*v1pb.ListShortcutsResponse, error) {
	v, err := s.ListMemoViews(ctx, &v1pb.ListMemoViewsRequest{Parent: r.Parent})
	if err != nil {
		return nil, err
	}
	out := &v1pb.ListShortcutsResponse{Shortcuts: []*v1pb.Shortcut{}}
	for _, item := range v.MemoViews {
		out.Shortcuts = append(out.Shortcuts, legacyShortcut(item))
	}
	return out, nil
}
func (s *APIV1Service) GetShortcut(ctx context.Context, r *v1pb.GetShortcutRequest) (*v1pb.Shortcut, error) {
	v, e := s.GetMemoView(ctx, &v1pb.GetMemoViewRequest{Name: shortcutViewName(r.Name)})
	return legacyShortcut(v), e
}
func (s *APIV1Service) CreateShortcut(ctx context.Context, r *v1pb.CreateShortcutRequest) (*v1pb.Shortcut, error) {
	var v *v1pb.MemoView
	if r.Shortcut != nil {
		v = &v1pb.MemoView{Name: shortcutViewName(r.Shortcut.Name), Title: r.Shortcut.Title, Filter: r.Shortcut.Filter}
	}
	out, e := s.CreateMemoView(ctx, &v1pb.CreateMemoViewRequest{Parent: r.Parent, MemoView: v})
	return legacyShortcut(out), e
}
func (s *APIV1Service) UpdateShortcut(ctx context.Context, r *v1pb.UpdateShortcutRequest) (*v1pb.Shortcut, error) {
	var v *v1pb.MemoView
	if r.Shortcut != nil {
		v = &v1pb.MemoView{Name: shortcutViewName(r.Shortcut.Name), Title: r.Shortcut.Title, Filter: r.Shortcut.Filter}
	}
	out, e := s.UpdateMemoView(ctx, &v1pb.UpdateMemoViewRequest{MemoView: v, UpdateMask: r.UpdateMask})
	return legacyShortcut(out), e
}
func (s *APIV1Service) DeleteShortcut(ctx context.Context, r *v1pb.DeleteShortcutRequest) (*emptypb.Empty, error) {
	return s.DeleteMemoView(ctx, &v1pb.DeleteMemoViewRequest{Name: shortcutViewName(r.Name)})
}
