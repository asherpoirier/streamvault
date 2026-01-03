import { useState, useEffect, useCallback } from "react";
import { Link, Navigate } from "react-router-dom";
import axios from "axios";
import { API, useAuth } from "@/App";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  Copy,
  Tv,
  Radio,
  Settings,
  LogOut,
  Check,
  Monitor,
  Layers,
} from "lucide-react";
import { toast } from "sonner";

export default function HomePage() {
  const { user, token, logout, loading: authLoading } = useAuth();
  const [channels, setChannels] = useState([]);
  const [providers, setProviders] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProvider, setSelectedProvider] = useState("");
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [copiedId, setCopiedId] = useState(null);

  // Fetch providers on load (lightweight - no channel data)
  useEffect(() => {
    if (token) {
      fetchProviders();
    }
  }, [token]);

  const fetchProviders = async () => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const response = await axios.get(`${API}/providers`, { headers });
      setProviders(response.data);
    } catch (error) {
      console.error("Failed to fetch providers:", error);
      if (error.response?.status === 401) {
        logout();
      }
    }
  };

  // Debounced search function
  const searchChannels = useCallback(async (query, provider) => {
    if (!query && !provider) {
      setChannels([]);
      setHasSearched(false);
      return;
    }

    setLoading(true);
    setHasSearched(true);

    try {
      const headers = { Authorization: `Bearer ${token}` };
      const params = new URLSearchParams();
      if (query) params.append("search", query);
      if (provider) params.append("provider", provider);

      const response = await axios.get(`${API}/channels?${params.toString()}`, { headers });
      setChannels(response.data);
    } catch (error) {
      console.error("Failed to search channels:", error);
      if (error.response?.status === 401) {
        logout();
      }
    } finally {
      setLoading(false);
    }
  }, [token, logout]);

  // Debounce search input
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (searchQuery.length >= 2 || selectedProvider) {
        searchChannels(searchQuery, selectedProvider);
      } else if (searchQuery.length === 0 && !selectedProvider) {
        setChannels([]);
        setHasSearched(false);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchQuery, selectedProvider, searchChannels]);

  // Group channels by provider
  const groupedChannels = channels.reduce((acc, channel) => {
    const provider = channel.provider_name;
    if (!acc[provider]) {
      acc[provider] = [];
    }
    acc[provider].push(channel);
    return acc;
  }, {});

  const copyToClipboard = async (url, channelName) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(channelName);
      toast.success("URL copied to clipboard!");
      setTimeout(() => setCopiedId(null), 2000);
    } catch (error) {
      toast.error("Failed to copy URL");
    }
  };

  const openInVLC = (url) => {
    window.location.href = `vlc://${url}`;
    toast.info("Opening in VLC...", {
      description: "Make sure VLC is installed on your system",
    });
  };

  const totalChannels = providers.reduce((acc, p) => acc + p.channel_count, 0);
  const totalProviders = providers.length;

  // Show loading while checking auth
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 glass border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/20 neon-glow">
                <Radio className="w-6 h-6 text-primary" />
              </div>
              <span className="text-xl font-semibold tracking-tight text-foreground">
                StreamVault
              </span>
            </div>

            <div className="flex items-center gap-4">
              {user.is_admin && (
                <Link to="/admin">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-slate-400 hover:text-white hover:bg-white/5"
                    data-testid="admin-dashboard-link"
                  >
                    <Settings className="w-4 h-4 mr-2" />
                    Admin
                  </Button>
                </Link>
              )}
              <span className="text-sm text-slate-400">
                {user.username}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={logout}
                className="text-slate-400 hover:text-white hover:bg-white/5"
                data-testid="logout-btn"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative py-16 lg:py-24 hero-gradient">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-4 animate-fade-in">
            <span className="text-foreground">Your Streaming</span>{" "}
            <span className="text-primary">Command Center</span>
          </h1>
          <p className="text-lg text-slate-400 max-w-2xl mx-auto mb-8 animate-fade-in stagger-1">
            Search channels from multiple IPTV providers in one place
          </p>

          {/* Stats */}
          <div className="flex items-center justify-center gap-8 mb-10 animate-fade-in stagger-2">
            <div className="flex items-center gap-2">
              <Tv className="w-5 h-5 text-cyan-400" />
              <span className="text-slate-300">
                <span className="font-semibold text-white">{totalChannels}</span>{" "}
                Channels Available
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-emerald-400" />
              <span className="text-slate-300">
                <span className="font-semibold text-white">{totalProviders}</span>{" "}
                Providers
              </span>
            </div>
          </div>

          {/* Search Bar */}
          <div className="max-w-2xl mx-auto animate-fade-in stagger-3">
            <div className="relative search-glow rounded-lg">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
              <Input
                type="text"
                placeholder="Search channels (min. 2 characters)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-14 pl-12 pr-4 text-lg bg-slate-900/80 border-white/10 focus:border-primary/50 placeholder:text-slate-600"
                data-testid="channel-search-input"
              />
            </div>
            <p className="text-sm text-slate-500 mt-2">
              Type to search across all providers, or filter by provider below
            </p>
          </div>
        </div>
      </section>

      {/* Provider Filter */}
      <section className="py-6 border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 overflow-x-auto pb-2">
            <span className="text-sm text-slate-500 shrink-0">Filter by provider:</span>
            <Button
              variant={selectedProvider === "" ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedProvider("")}
              className={
                selectedProvider === ""
                  ? "bg-primary hover:bg-primary/90"
                  : "bg-transparent border-white/10 hover:bg-white/5"
              }
              data-testid="filter-all-providers"
            >
              All Providers
            </Button>
            {providers.map((provider) => (
              <Button
                key={provider.id}
                variant={
                  selectedProvider === provider.name ? "default" : "outline"
                }
                size="sm"
                onClick={() => setSelectedProvider(provider.name)}
                className={
                  selectedProvider === provider.name
                    ? "bg-primary hover:bg-primary/90"
                    : "bg-transparent border-white/10 hover:bg-white/5"
                }
                data-testid={`filter-provider-${provider.name}`}
              >
                {provider.name}{" "}
                <Badge
                  variant="secondary"
                  className="ml-2 bg-white/10 text-xs"
                >
                  {provider.channel_count}
                </Badge>
              </Button>
            ))}
          </div>
        </div>
      </section>

      {/* Channels List */}
      <section className="py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
            </div>
          ) : !hasSearched ? (
            <div className="text-center py-16">
              <Search className="w-16 h-16 mx-auto text-slate-600 mb-4" />
              <h3 className="text-xl font-medium text-slate-400 mb-2">
                Search for channels
              </h3>
              <p className="text-slate-500">
                Enter at least 2 characters to search, or select a provider to browse
              </p>
            </div>
          ) : Object.keys(groupedChannels).length === 0 ? (
            <div className="text-center py-16">
              <Tv className="w-16 h-16 mx-auto text-slate-600 mb-4" />
              <h3 className="text-xl font-medium text-slate-400 mb-2">
                No channels found
              </h3>
              <p className="text-slate-500">
                Try a different search term or select another provider
              </p>
            </div>
          ) : (
            <div className="space-y-10">
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-400">
                  Found <span className="text-white font-medium">{channels.length}</span> channels
                </p>
              </div>
              
              {Object.entries(groupedChannels).map(
                ([providerName, providerChannels]) => (
                  <div key={providerName} className="animate-fade-in">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="provider-badge px-3 py-1 rounded-md">
                        <span className="text-sm font-medium text-primary">
                          {providerName}
                        </span>
                      </div>
                      <span className="text-sm text-slate-500">
                        {providerChannels.length} channels
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {providerChannels.map((channel, idx) => (
                        <div
                          key={`${channel.provider_name}-${channel.name}-${idx}`}
                          className="channel-card glass-light rounded-lg p-4 group"
                          data-testid={`channel-card-${idx}`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              {channel.logo ? (
                                <img
                                  src={channel.logo}
                                  alt={channel.name}
                                  className="w-10 h-10 rounded object-cover bg-slate-800 shrink-0"
                                  onError={(e) => {
                                    e.target.style.display = "none";
                                  }}
                                />
                              ) : (
                                <div className="w-10 h-10 rounded bg-slate-800 flex items-center justify-center shrink-0">
                                  <Tv className="w-5 h-5 text-slate-600" />
                                </div>
                              )}
                              <div className="min-w-0">
                                <h3 className="font-medium text-foreground truncate">
                                  {channel.name}
                                </h3>
                                {channel.group && (
                                  <p className="text-xs text-slate-500 truncate">
                                    {channel.group}
                                  </p>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 hover:bg-white/10"
                                onClick={() =>
                                  copyToClipboard(channel.url, channel.name)
                                }
                                title="Copy URL"
                                data-testid={`copy-url-btn-${idx}`}
                              >
                                {copiedId === channel.name ? (
                                  <Check className="w-4 h-4 text-emerald-400" />
                                ) : (
                                  <Copy className="w-4 h-4 text-slate-400" />
                                )}
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 hover:bg-white/10"
                                onClick={() => openInVLC(channel.url)}
                                title="Open in VLC"
                                data-testid={`open-vlc-btn-${idx}`}
                              >
                                <Monitor className="w-4 h-4 text-slate-400" />
                              </Button>
                            </div>
                          </div>

                          {/* URL preview */}
                          <div className="mt-3 p-2 bg-slate-950/50 rounded text-xs mono text-slate-500 truncate">
                            {channel.url}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              )}
            </div>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between text-sm text-slate-500">
            <div className="flex items-center gap-2">
              <Radio className="w-4 h-4 text-primary" />
              <span>StreamVault</span>
            </div>
            <p>M3U8 Playlist Manager</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
