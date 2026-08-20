package profile

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestAllowAnonymous(t *testing.T) {
	cases := []struct {
		name string
		url  string
		want bool
	}{
		{"empty is private", "", false},
		{"whitespace only is private", "   ", false},
		{"configured url is public", "https://memos.example.com", true},
		{"configured url with padding is public", "  https://memos.example.com  ", true},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			p := &Profile{InstanceURL: c.url}
			if got := p.AllowAnonymous(); got != c.want {
				t.Fatalf("AllowAnonymous() with InstanceURL=%q = %v, want %v", c.url, got, c.want)
			}
		})
	}
}

func TestNormalizeInstanceURL(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		want    string
		wantErr string
	}{
		{name: "empty disables URL features", input: "  ", want: ""},
		{name: "trims whitespace and trailing slash", input: " https://memos.example.com/app/ ", want: "https://memos.example.com/app"},
		{name: "allows HTTP localhost", input: "http://localhost:5230", want: "http://localhost:5230"},
		{name: "requires an absolute URL", input: "memos.example.com", wantErr: "absolute HTTP(S)"},
		{name: "rejects unsupported schemes", input: "ftp://memos.example.com", wantErr: "absolute HTTP(S)"},
		{name: "rejects credentials", input: "https://admin:secret@memos.example.com", wantErr: "credentials"},
		{name: "rejects query", input: "https://memos.example.com?source=test", wantErr: "query or fragment"},
		{name: "rejects fragment", input: "https://memos.example.com/#explore", wantErr: "query or fragment"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got, err := NormalizeInstanceURL(test.input)
			if test.wantErr != "" {
				require.ErrorContains(t, err, test.wantErr)
				return
			}
			require.NoError(t, err)
			require.Equal(t, test.want, got)
		})
	}
}

func TestInstanceURLRuntimeUpdate(t *testing.T) {
	p := &Profile{InstanceURL: "https://old.example.com"}
	require.Equal(t, "https://old.example.com", p.GetInstanceURL())
	require.True(t, p.AllowAnonymous())

	p.SetInstanceURL("")
	require.Empty(t, p.GetInstanceURL())
	require.False(t, p.AllowAnonymous())
}
