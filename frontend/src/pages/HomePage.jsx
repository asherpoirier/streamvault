import { useState, useEffect, useCallback, useRef } from "react";
import { Link, Navigate } from "react-router-dom";
import axios from "axios";
import Hls from "hls.js";
import mpegts from "mpegts.js";
import { API, useAuth } from "@/App";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Search,
  Copy,
  Tv,
  Radio,
  Settings,
  LogOut,
  Check,
  Play,
  Layers,
  X,
  Volume2,
  VolumeX,
  Maximize,
  Loader2,
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
  
  // Video player state
  const [playerOpen, setPlayerOpen] = useState(false);
  const [currentChannel, setCurrentChannel] = useState(null);
  const [playerLoading, setPlayerLoading] = useState(false);
  const [playerError, setPlayerError] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const mpegtsRef = useRef(null);

  // Fetch providers on load (lightweight - no channel data)
  useEffect(() => {
    if (token) {
      fetchProviders();
    }
  }, [token]);

  // Cleanup HLS/MPEGTS on unmount
  useEffect(() => {
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
      }
      if (mpegtsRef.current) {
        mpegtsRef.current.destroy();
      }
    };
  }, []);

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
      // Try modern clipboard API first
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(url);
      } else {
        // Fallback for non-secure contexts
        const textArea = document.createElement("textarea");
        textArea.value = url;
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        textArea.style.top = "-999999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        textArea.remove();
      }
      setCopiedId(channelName);
      toast.success("URL copied to clipboard!");
      setTimeout(() => setCopiedId(null), 2000);
    } catch (error) {
      // Last resort fallback - show the URL in a prompt
      toast.info("Copy the URL below:", {
        description: url,
        duration: 10000,
      });
    }
  };

  const openPlayer = (channel) => {
    setCurrentChannel(channel);
    setPlayerOpen(true);
    setPlayerLoading(true);
    setPlayerError(null);
  };

  const closePlayer = () => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    if (mpegtsRef.current) {
      mpegtsRef.current.destroy();
      mpegtsRef.current = null;
    }
    setPlayerOpen(false);
    setCurrentChannel(null);
    setPlayerError(null);
  };

  // Initialize video player when dialog opens
  useEffect(() => {
    if (!playerOpen || !currentChannel) return;
    
    const originalUrl = currentChannel.url;

    // Cleanup previous instances
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    if (mpegtsRef.current) {
      mpegtsRef.current.destroy();
      mpegtsRef.current = null;
    }

    // Check file type first - before needing video ref
    const isHLS = originalUrl.toLowerCase().includes('.m3u8') || originalUrl.toLowerCase().includes('.m3u');
    const isTS = originalUrl.toLowerCase().endsWith('.ts') || originalUrl.toLowerCase().includes('.ts?');
    
    // Need video ref for playable formats
    const video = videoRef.current;
    if (!video) return;

    setPlayerLoading(true);
    setPlayerError(null);
    
    // Proxy URL for the stream - include token as query param for mpegts.js
    const proxyUrl = `${API}/proxy/stream?url=${encodeURIComponent(originalUrl)}&token=${encodeURIComponent(token)}`;
    
    if (isTS && !isHLS) {
      // Use mpegts.js for MPEG-TS streams
      if (mpegts.isSupported()) {
        const player = mpegts.createPlayer({
          type: 'mpegts',
          isLive: true,
          url: proxyUrl,
        }, {
          enableWorker: true,
          lazyLoadMaxDuration: 3 * 60,
          seekType: 'range',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        mpegtsRef.current = player;
        player.attachMediaElement(video);
        player.load();
        
        player.on(mpegts.Events.LOADING_COMPLETE, () => {
          setPlayerLoading(false);
        });
        
        player.on(mpegts.Events.METADATA_ARRIVED, () => {
          setPlayerLoading(false);
          video.play().catch(e => console.log("Autoplay prevented:", e));
        });
        
        player.on(mpegts.Events.ERROR, (errorType, errorDetail, errorInfo) => {
          console.error("MPEGTS Error:", errorType, errorDetail, errorInfo);
          setPlayerLoading(false);
          setPlayerError("Failed to load stream. The stream may be offline or unavailable.");
        });
        
        // Also try to play after a short delay
        setTimeout(() => {
          video.play().catch(e => console.log("Autoplay prevented:", e));
        }, 1000);
        
      } else {
        setPlayerLoading(false);
        setPlayerError("Your browser doesn't support MPEG-TS playback. Please copy the URL and use VLC.");
      }
    } else if (isHLS) {
      // HLS stream - use proxy with URL rewriting
      const apiBase = encodeURIComponent(API);
      const hlsProxyUrl = `${API}/proxy/m3u8?url=${encodeURIComponent(originalUrl)}&api_base=${apiBase}`;
      
      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
          xhrSetup: function(xhr, url) {
            if (url.includes('/api/proxy/')) {
              xhr.setRequestHeader('Authorization', `Bearer ${token}`);
            }
          },
        });
        hlsRef.current = hls;

        hls.loadSource(hlsProxyUrl);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          setPlayerLoading(false);
          video.play().catch(e => console.log("Autoplay prevented:", e));
        });

        hls.on(Hls.Events.ERROR, (event, data) => {
          console.error("HLS Error:", data);
          if (data.fatal) {
            setPlayerLoading(false);
            setPlayerError("Failed to load HLS stream. The stream may be offline.");
          }
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = hlsProxyUrl;
        video.addEventListener('loadedmetadata', () => {
          setPlayerLoading(false);
          video.play().catch(e => console.log("Autoplay prevented:", e));
        });
        video.addEventListener('error', () => {
          setPlayerLoading(false);
          setPlayerError("Failed to load stream.");
        });
      }
    } else {
      // Other formats (mp4, etc) - try to play directly via proxy
      const fetchWithAuth = async () => {
        try {
          const response = await fetch(proxyUrl, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });
          
          if (!response.ok) {
            throw new Error('Stream fetch failed');
          }
          
          const blob = await response.blob();
          const blobUrl = URL.createObjectURL(blob);
          video.src = blobUrl;
          
          video.onloadedmetadata = () => {
            setPlayerLoading(false);
            video.play().catch(e => console.log("Autoplay prevented:", e));
          };
          
          video.onerror = () => {
            setPlayerLoading(false);
            setPlayerError("Failed to play stream. Format may not be supported in browser.");
          };
          
        } catch (error) {
          console.error("Fetch error:", error);
          setPlayerLoading(false);
          setPlayerError("Failed to load stream. The stream may be offline.");
        }
      };
      
      fetchWithAuth();
    }

    // Timeout for streams that hang
    const timeout = setTimeout(() => {
      if (playerLoading) {
        setPlayerLoading(false);
        setPlayerError("Stream is taking too long to load. It may be offline or unavailable.");
      }
    }, 20000);

    return () => clearTimeout(timeout);
  }, [playerOpen, currentChannel, token]);

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
      setIsMuted(!isMuted);
    }
  };

  const toggleFullscreen = () => {
    if (videoRef.current) {
      if (videoRef.current.requestFullscreen) {
        videoRef.current.requestFullscreen();
      } else if (videoRef.current.webkitRequestFullscreen) {
        videoRef.current.webkitRequestFullscreen();
      }
    }
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
                                className="h-8 w-8 hover:bg-primary/20"
                                onClick={() => openPlayer(channel)}
                                title="Play in browser"
                                data-testid={`play-btn-${idx}`}
                              >
                                <Play className="w-4 h-4 text-primary" />
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

      {/* Video Player Modal */}
      <Dialog open={playerOpen} onOpenChange={(open) => !open && closePlayer()}>
        <DialogContent className="max-w-4xl bg-slate-950 border-white/10 p-0 overflow-hidden">
          <DialogHeader className="p-4 pb-0">
            <DialogTitle className="text-foreground flex items-center gap-3">
              {currentChannel?.logo && (
                <img
                  src={currentChannel.logo}
                  alt=""
                  className="w-8 h-8 rounded object-cover"
                  onError={(e) => e.target.style.display = "none"}
                />
              )}
              <span className="truncate">{currentChannel?.name}</span>
            </DialogTitle>
          </DialogHeader>
          
          <div className="relative bg-black aspect-video">
            {playerLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black z-10">
                <div className="text-center">
                  <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-2" />
                  <p className="text-slate-400">Loading stream...</p>
                </div>
              </div>
            )}
            
            {playerError && (
              <div className="absolute inset-0 flex items-center justify-center bg-black z-20">
                <div className="text-center p-8 max-w-md">
                  <Tv className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                  <p className="text-slate-400 mb-4 text-sm">{playerError}</p>
                  <div className="space-y-3">
                    <Button
                      onClick={() => copyToClipboard(currentChannel?.url, currentChannel?.name)}
                      className="bg-primary hover:bg-primary/90 w-full"
                    >
                      <Copy className="w-4 h-4 mr-2" />
                      Copy Stream URL
                    </Button>
                    <p className="text-xs text-slate-500">
                      Open VLC → Media → Open Network Stream → Paste URL
                    </p>
                  </div>
                </div>
              </div>
            )}
            
            <video
              ref={videoRef}
              className="w-full h-full"
              controls
              autoPlay
              playsInline
            />
          </div>
          
          <div className="p-4 flex items-center justify-between border-t border-white/5">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleMute}
                className="h-8 w-8 hover:bg-white/10"
              >
                {isMuted ? (
                  <VolumeX className="w-4 h-4 text-slate-400" />
                ) : (
                  <Volume2 className="w-4 h-4 text-slate-400" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleFullscreen}
                className="h-8 w-8 hover:bg-white/10"
              >
                <Maximize className="w-4 h-4 text-slate-400" />
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <code className="text-xs text-slate-500 bg-slate-900 px-2 py-1 rounded max-w-xs truncate hidden sm:block">
                {currentChannel?.url}
              </code>
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyToClipboard(currentChannel?.url, currentChannel?.name)}
                className="bg-transparent border-white/10 shrink-0"
              >
                <Copy className="w-4 h-4 mr-2" />
                Copy URL
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
