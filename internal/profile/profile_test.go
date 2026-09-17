package profile

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestValidateInstanceURL(t *testing.T) {
	cases := []struct {
		name    string
		url     string
		want    string
		wantErr bool
	}{
		{name: "empty", url: ""},
		{name: "canonical https", url: "https://memos.example.com", want: "https://memos.example.com"},
		{name: "trim spaces and trailing slash", url: "  https://memos.example.com/app/  ", want: "https://memos.example.com/app"},
		{name: "http with port", url: "http://localhost:8080/", want: "http://localhost:8080"},
		{name: "missing scheme", url: "memos.example.com", wantErr: true},
		{name: "unsupported scheme", url: "ftp://memos.example.com", wantErr: true},
		{name: "missing host", url: "https:///memos", wantErr: true},
		{name: "credentials", url: "https://user:pass@memos.example.com", wantErr: true},
		{name: "query", url: "https://memos.example.com?tenant=one", wantErr: true},
		{name: "fragment", url: "https://memos.example.com/#top", wantErr: true},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			p := &Profile{Data: t.TempDir(), Driver: "sqlite", InstanceURL: c.url}
			err := p.Validate()
			if c.wantErr {
				require.Error(t, err)
				return
			}
			require.NoError(t, err)
			require.Equal(t, c.want, p.InstanceURL)
		})
	}
}

func TestValidateRejectsDemoWithNonSQLiteDriver(t *testing.T) {
	p := &Profile{Demo: true, Driver: "postgres", Data: t.TempDir()}
	require.ErrorContains(t, p.Validate(), "demo mode requires the sqlite database driver")
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

	p.SetInstanceURL("")
	require.Empty(t, p.GetInstanceURL())
}
